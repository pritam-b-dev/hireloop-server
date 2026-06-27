const express = require("express");
const cors = require("cors");
const app = express();
const port = 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

//middleware
app.use(cors()); // এটাও মিডলওয়ার হিসেবে কাজ করে। সবার আগে অনুমতি চেক করে।
app.use(express.json()); // এটাও মিডলওয়ার হিসেবে কাজ করে। রিকোয়েস্টের বডিটা রেডি করে দেয়।
//এছাড়াও প্রজেক্টের রিকোয়ারমেন্ট হিসেবে আমরা কাস্টম মিডলওয়ার বানাই এবগ এটা বানাতে হয়ই।

const logger = (req, res, next) => {
  console.log("logger middleware logged", req.params);
  next();
};

const uri = process.env.MONGODB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    //db and collection
    const database = client.db("hireloop_db");
    const jobCollection = database.collection("jobs");
    const companyCollection = database.collection("companies");
    const userCollection = database.collection("user");
    const applicationsCollection = database.collection("applications");
    const planCollection = database.collection("plans");
    const subscriptionCollection = database.collection("subscriptions");
    const sessionCollection = database.collection("session");

    //varification related
    const verifyToken = async (req, res, next) => {
      console.log("headers", req.headers);
      const authHeader = req.headers?.authorization;
      if (!authHeader) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = authHeader.split(" ")[1];
      if (!token) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const query = { token: token };
      const session = await sessionCollection.findOne(query);
      if (!session) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      console.log("session is", session);
      const userId = session.userId;
      const userQuery = {
        _id: userId,
      };
      const user = await userCollection.findOne(userQuery);
      if (!user) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      //set data in the req object
      req.user = user;
      next();
    };

    //must be used after varifyToken middleware
    const verifySeeker = async (req, res, next) => {
      if (req.user?.role !== "seeker") {
        return res.status(403).send({ message: "forbidden access" });
      }

      next();
    };
    //must be used after varifyToken middleware
    const verifyReqruiter = async (req, res, next) => {
      if (req.user?.role !== "recruiter") {
        return res.status(403).send({ message: "forbidden access" });
      }

      next();
    };

    //must be used after varifyToken middleware
    const verifyAdmin = async (req, res, next) => {
      if (req.user?.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }

      next();
    };

    //api

    //jobs related api

    app.get("/api/jobs", async (req, res) => {
      const query = {};
      //job filter related query

      if (req.query.search) {
        query.$or = [
          { jobTitle: { $regex: req.query.search, $options: "i" } },
          { companyName: { $regex: req.query.search, $options: "i" } },
        ];
      }

      if (req.query.jobType) {
        query.jobType = req.query.jobType;
      }
      if (req.query.jobCategory) {
        query.jobCategory = req.query.jobCategory;
      }

      //company related query
      if (req.query.companyId) {
        query.companyId = req.query.companyId;
      }
      if (req.query.status) {
        query.status = req.query.status;
      }

      const cursor = jobCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/api/jobs/:id", async (req, res) => {
      const id = req.params.id;
      const query = {
        _id: new ObjectId(id),
      };
      const result = await jobCollection.findOne(query);
      res.send(result);
    });

    app.post("/api/jobs", async (req, res) => {
      const job = req.body;
      const newJob = {
        ...job,
        createdAt: new Date(),
      };
      const result = await jobCollection.insertOne(newJob);
      res.send(result);
    });

    //application related api
    app.get(
      "/api/applications",
      verifyToken,
      verifySeeker,
      async (req, res) => {
        const query = {};
        if (req.query.applicantId) {
          query.applicantId = req.query.applicantId;

          //check whether asking for user information or someone else
          if (req.user._id.toString() !== req.query.applicantId) {
            return res.status(403).send({ message: "forbidden access" });
          }
        }
        if (req.query.jobId) {
          query.jobId = req.query.jobId;
        }
        const cursor = applicationsCollection.find(query);
        const result = await cursor.toArray();
        res.send(result);
      },
    );

    app.post("/api/applications", async (req, res) => {
      const application = req.body;
      const newApplication = {
        ...application,
        createdAt: new Date(),
      };
      const result = await applicationsCollection.insertOne(newApplication);
      res.send(result);
    });

    //company related api
    app.get("/api/companies", logger, verifyToken, async (req, res) => {
      const result = await companyCollection
        .aggregate([
          {
            $lookup: {
              from: "jobs",
              let: { compId: { $toString: "$_id" } }, // কোম্পানির আইডিকে স্ট্রিং
              pipeline: [
                { $match: { $expr: { $eq: ["$companyId", "$$compId"] } } }, // স্ট্রিং এর সাথে স্ট্রিং
              ],
              as: "jobs",
            },
          },
          {
            $addFields: {
              jobCount: { $size: "$jobs" },
            },
          },
          {
            $project: {
              jobs: 0,
            },
          },
        ])
        .toArray();

      res.send(result);
    });

    app.get("/api/my/companies", async (req, res) => {
      const query = {};
      if (req.query.recruiterId) {
        query.recruiterId = req.query.recruiterId;
      }
      const result = await companyCollection.findOne(query);
      res.send(result || {});
    });

    app.post("/api/companies", async (req, res) => {
      const company = req.body;
      const newCompany = {
        ...company,
        createdAt: new Date(),
      };
      const result = await companyCollection.insertOne(newCompany);
      res.send(result);
    });

    app.patch(
      "/api/companies/:id",
      logger,
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const updatedCompany = req.body;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            status: updatedCompany.status,
          },
        };
        const result = await companyCollection.updateOne(filter, updatedDoc);
        res.send(result);
      },
    );

    //plans related api

    app.get("/api/plans", async (req, res) => {
      const query = {};
      if (req.query.plan_id) {
        query.id = req.query.plan_id;
      }
      const plan = await planCollection.findOne(query);
      res.send(plan);
    });

    //subscriptions related api

    app.post("/api/subscriptions", async (req, res) => {
      const data = req.body;
      const subsInfo = {
        ...data,
        createdAt: new Date(),
      };
      const result = await subscriptionCollection.insertOne(subsInfo);
      const filter = { email: data.email };
      const updateDocument = {
        $set: {
          plan: data.planId,
        },
      };
      const updateResult = await userCollection.updateOne(
        filter,
        updateDocument,
      );
      res.send(updateResult);
    });

    // Send a ping to confirm a successful connection

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
