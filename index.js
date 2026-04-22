const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const app = express();
const port = process.env.PORT || 5000; 
const jwt = require('jsonwebtoken'); 
const cookieParser = require('cookie-parser');

app.use(cors({
    origin: ['http://localhost:5173'], 
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

const uri = process.env.MONGODB_URI; 

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: 'Unauthorized access' });
  }
  
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'Unauthorized access' });
    }
    req.user = decoded;
    next();
  });
};
async function run() {
  try {
    const db = client.db("luma_db");
    const usersCollection = db.collection("users");
    const coursesCollection = db.collection("courses");
    const instructorsCollection = db.collection("instructors");
    const progressCollection = db.collection("progress");
    const ordersCollection = db.collection("orders");

    app.get('/health', (req, res) => {
      res.send({ status: 'Luma server is healthy', database: 'Connected' });
    });

    app.post('/jwt', async (req, res) => {
    const user = req.body;
    const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
    
    res.cookie('token', token, {
        httpOnly: true,
        secure: false, 
        sameSite: 'lax', 
        path: '/'      
    }).send({ success: true });
});

app.post('/users', async (req, res) => {
    const user = req.body;
    const query = { email: user.email };
    const existingUser = await usersCollection.findOne(query);
    
    if (existingUser) {
        return res.send({ message: 'User already exists', insertedId: null });
    }
    
    const result = await usersCollection.insertOne(user);
    res.send(result);
});

app.post('/logout', async (req, res) => {
    res.clearCookie('token', { maxAge: 0 }).send({ success: true });
});

    app.get('/courses', async (req, res) => {
      const result = await coursesCollection.find().toArray();
      res.send(result);
    });

    app.get('/courses/:id', async (req, res) => {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const result = await coursesCollection.findOne(query);
    res.send(result);
});




    app.get('/instructors', async (req, res) => {
    try {
        const result = await instructorsCollection.find().toArray();
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Failed to fetch instructors", error });
    }
});

app.patch('/update-progress', verifyToken, async (req, res) => {
  const { userId, courseId, lessonId } = req.body;
  
  try {
    const query = { userId, courseId };
    const updateDoc = {
      $addToSet: { completedLessons: lessonId }, 
      $set: { lastWatched: lessonId }
    };

    const result = await progressCollection.updateOne(query, updateDoc, { upsert: true });
    
    const updatedProgress = await progressCollection.findOne(query);
    res.send(updatedProgress);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Internal Server Error", error: err });
  }
});

app.get('/progress/:userId/:courseId', async (req, res) => {
  const { userId, courseId } = req.params;
  try {
    const result = await progressCollection.findOne({ userId, courseId });
    res.send(result || { completedLessons: [], lastWatched: 1 });
  } catch (err) {
    res.status(500).send(err);
  }
});


app.patch('/api/wishlist', verifyToken, async (req, res) => {
    const { userId, courseId } = req.body;
    
    try {
        // userId যদি string হিসেবে আসে তবে সেটাকে ObjectId তে রূপান্তর করতে হবে
        const query = { _id: new ObjectId(userId) };
        const user = await usersCollection.findOne(query);

        if (!user) {
            return res.status(404).send({ message: 'User not found' });
        }

        // চেক করা হচ্ছে কোর্সটি আগে থেকেই উইশলিস্টে আছে কি না
        const isExist = user.wishlist?.includes(courseId);

        const update = isExist 
            ? { $pull: { wishlist: courseId } } 
            : { $addToSet: { wishlist: courseId } };

        const result = await usersCollection.updateOne(query, update);
        res.send({ success: true, isAdded: !isExist });
        
    } catch (error) {
        res.status(500).send({ message: "Internal server error", error });
    }
});

app.post('/create-checkout-session', async (req, res) => {
      try {
        const { course, userEmail } = req.body;
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [{
            price_data: {
              currency: 'usd',
              product_data: { 
                name: course.title, 
                images: [course.thumbnail] 
              },
              unit_amount: Math.round(parseFloat(course.price) * 100),
            },
            quantity: 1,
          }],
          mode: 'payment',
          success_url: `http://localhost:5173/dashboard/payments?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `http://localhost:5173/courses`,
          metadata: { 
            courseId: course._id, 
            courseName: course.title, // এটি যোগ করা হয়েছে
            userEmail: userEmail 
          }
        });
        res.json({ url: session.url }); 
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // ২. পেমেন্ট কনফার্মেশন (db.collection এর বদলে ভেরিয়েবল ব্যবহার করা হয়েছে)
    app.post('/confirm-payment', async (req, res) => {
  const { sessionId } = req.body;
 // console.log("1. Received Session ID from Frontend:", sessionId);

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    console.log("2. Stripe Session Metadata:", session.metadata);
    console.log("3. Payment Status:", session.payment_status);

    if (session.payment_status === 'paid') {
      const transactionId = session.payment_intent || session.id;
      
      const orderData = {
        email: session.metadata.userEmail,
        courseId: session.metadata.courseId,
        courseName: session.metadata.courseName || "Premium Course",
        transactionId: transactionId,
        amount: session.amount_total / 100,
        date: new Date(),
        status: 'success'
      };

      // চেক করুন এই transactionId দিয়ে আগে থেকেই ডাটা আছে কি না
      const existingOrder = await ordersCollection.findOne({ transactionId: transactionId });
      
      if (!existingOrder) {
        const result = await ordersCollection.insertOne(orderData);
        console.log("4. Data Inserted Successfully:", result);

        // ইউজার কালেকশনে আপডেট
        const userUpdate = await usersCollection.updateOne(
          { email: session.metadata.userEmail },
          { $addToSet: { enrolledCourses: session.metadata.courseId } }
        );
        console.log("5. User Enrollment Update:", userUpdate);

        return res.send({ success: true, result });
      } else {
        console.log("X. Order already exists in Database");
        return res.send({ success: true, message: "Order already saved" });
      }
    } else {
      console.log("X. Payment not completed yet");
      return res.status(400).send({ success: false, message: "Payment status not paid" });
    }
  } catch (error) {
    console.error("Critical Error in confirm-payment:", error.message);
    res.status(500).send({ success: false, error: error.message });
  }
});

    app.get('/orders/:email', verifyToken, async (req, res) => {
  try {
    const email = req.params.email;
    const result = await ordersCollection.find({ email: email }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send(error);
  }
});

    console.log("Successfully connected to MongoDB!");
  } finally {
    
  }
} 
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Luma Server is running');
});

app.listen(port, () => {
  console.log(`Luma server listening on port ${port}`);
});