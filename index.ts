import express, { Request, Response } from "express";
import cors from "cors";
import firebase, { database } from "firebase/app";
import crypto, { async } from "crypto-random-string";
import "firebase/auth";
import "firebase/firestore";
import bodyParser from "body-parser";
import firebaseConfig from "./config/default";
import { FirebaseFunctionsRateLimiter } from "firebase-functions-rate-limiter";

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
// Limit the number of hits on my API
const limiterConfiguration = {
  name: "rate_limiter_collection", // a collection with this name will be created
  periodSeconds: 15, // the length of test period in seconds
  maxCalls: 5, // number of maximum allowed calls in the period
};

const limiter = FirebaseFunctionsRateLimiter.withFirestoreBackend(
  limiterConfiguration,
  db
);

//options for cors midddleware
const options: cors.CorsOptions = {
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "X-Access-Token",
  ],
  credentials: true,
  methods: "GET,HEAD,OPTIONS,PUT,PATCH,POST,DELETE",
  preflightContinue: false,
};

type UserDetails = {
  username: string;
  password: string;
};

const PORT = process.env.PORT || 3000;
const app = express();

app.use(bodyParser.json());
app.use(cors(options));

app.get("/", async (req, res) => {
  await limiter.rejectOnQuotaExceededOrRecordUsage(); // will throw HttpsException with proper warning
  var ip = req.header("x-forwarded-for") || req.connection.remoteAddress;
  res.send(req.ip);
});

app.post("/login", async (req, res) => {
  await limiter.rejectOnQuotaExceededOrRecordUsage(); // will throw HttpsException with proper warnin
  const userDetails: UserDetails = req.body;
  var ip = req.header("x-forwarded-for") || req.connection.remoteAddress;
  await firebase
    .auth()
    .signInWithEmailAndPassword(userDetails.username, userDetails.password)
    .then(function (userObj) {
      isNewLocation(userObj.user.uid, ip).then(function (isNew) {
        if (isNew) {
          const token = crypto({ length: 32 });
          storeTokenForUser(userObj.user.uid, ip, token).then(function () {
            res.statusMessage = token;
            res.status(400).end();
          });
        } else {
          res.status(200).send(userObj.user.email);
        }
      });
    })
    .catch(function (error) {
      console.log(error);
      res.status(404).send({ error: "User not found" });
    });
});

app.get("/verifyLocation", async (req, res) => {
  const token = req.query.token;
  let userId = "";
  let newIpAddress = "";
  const querySnapshot = await db
    .collection("userLocations")
    .where("token", "==", token)
    .get();
  if (querySnapshot.empty) {
    console.log("Error");
    res.status(400).send({ error: "Link no longer valid" });
  }

  querySnapshot.forEach((doc) => {
    userId = doc.id;
    newIpAddress = doc.data().tokenLocation;
    const docRef = db.collection("userLocations").doc(userId);
    // Get a new write batch
    var batch = db.batch();
    batch.update(docRef, {
      locationHistory: firebase.firestore.FieldValue.arrayUnion(newIpAddress),
    });
    batch.set(
      docRef,
      {
        token: firebase.firestore.FieldValue.delete(),
        tokenLocation: firebase.firestore.FieldValue.delete(),
      },
      { merge: true }
    );
    let result = batch.commit();
    res.status(200).send({
      message: "success",
    });
  });
});

app.listen(PORT, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${PORT}`);
});

const isNewLocation = async function (
  userId: string,
  ipLocation: string
): Promise<boolean> {
  const docRef = db.collection("userLocations").doc(userId);
  const doc = await docRef.get();
  if (doc.exists) {
    var { locationHistory } = doc.data();
    if (locationHistory.includes(ipLocation)) {
      return false;
    }
  }
  return true;
};

const storeTokenForUser = async function (
  userId: string,
  newIpAddress: string,
  token: string
) {
  const docRef = db.collection("userLocations").doc(userId);
  await docRef.set(
    {
      token: token,
      tokenLocation: newIpAddress,
    },
    { merge: true }
  );
  return;
};
