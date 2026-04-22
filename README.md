# Luma - Backend Server

The robust backend infrastructure for the EduNexus platform, handling data orchestration, security, and payment processing.

##  Key Functionalities
* **RESTful API:** Clean and scalable endpoints for users, courses, and orders.
* **Authentication:** Secure JWT (JSON Web Token) generation and verification via HTTP-only cookies.
* **Payment Integration:** Server-side Stripe integration to handle checkout sessions and payment confirmations.
* **Database Management:** MongoDB integration for efficient storage of user data and course progress.
* **Security:** CORS configuration and environment variable protection.

##  Tech Stack
* **Runtime:** Node.js
* **Framework:** Express.js
* **Database:** MongoDB Atlas
* **Security:** JWT, Cookie-parser, CORS
* **Payment:** Stripe API
* **Deployment:** Vercel

##  Installation & Setup
1. **Clone the repository:**
   ```bash
   git clone <your-server-repo-url>
