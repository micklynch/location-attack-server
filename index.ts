import express, { Request, Response } from "express";
import cors from "cors";
import firebase from "firebase/app";
import "firebase/auth";
import "firebase/firestore";
import bodyParser from "body-parser";
import firebaseConfig from "./config/default";
import { FirebaseFunctionsRateLimiter } from "firebase-functions-rate-limiter";
import Analytics from "analytics-node";

const client = new Analytics(process.env.SEGMENTIO);

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
// Limit the number of requests to my server. This is here to stop my firebase account from getting charged
const limiterConfiguration = {
  name: "rate_limiter_collection", // a collection with this name will be created
  periodSeconds: 15, // the length of test period in seconds
  maxCalls: 5, // number of maximum allowed calls in the period
};

const limiter = FirebaseFunctionsRateLimiter.withFirestoreBackend(
  limiterConfiguration,
  db
);
// User details expected from the client
type UserDetails = {
  username: string;
  password: string;
};

const PORT = process.env.PORT || 3000;
const app = express();

app.use(cors());
app.use(bodyParser.json());
/**
 * Home route
 */
app.get("/", async (req, res) => {
  await limiter.rejectOnQuotaExceededOrRecordUsage(); // will throw HttpsException with proper warning
  res.status(200).send({
    Hello: "World",
  });
});
/**
 * Login route
 * Takes a user crendials object as input
 * @param {username: "test@email.com", password : "sTrOnGpAsSwOrD"}
 *
 */
app.post("/login", async (req, res) => {
  await limiter.rejectOnQuotaExceededOrRecordUsage(); // will throw HttpsException with proper warnin
  var ip = req.header("x-forwarded-for") || req.connection.remoteAddress;
  const userDetails = req.body as UserDetails;
  try {
    const userObj = await firebase
      .auth()
      .signInWithEmailAndPassword(userDetails.username, userDetails.password);
    if (userObj) {
      // check if this is a new location for the user
      const newLocation = await isNewLocation(userObj.user.uid, ip);
      // if new location, store the new location and
      if (newLocation) {
        // generate a random token
        const token = CreateUUID();
        await storeTokenForUser(userObj.user.uid, ip, token);
        emailLinkToUser(userObj.user.email, token);
        res.status(202).send({
          message: "You will receive an email with a link to login",
        });
      } else {
        // Send whatever information you want back to the client (in my case, just the email)
        client.track({
          event: "Server Side Login",
          userId: userObj.user.uid,
        });
        res.status(200).send(userObj.user.email);
      }
    }
  } catch (error) {
    console.log(error);
    res.status(500).send({
      message:
        "There was an error logging in, please check your username and password",
    });
  }
});
/**
 * Verify route
 * @param token
 */
app.get("/verifyLocation", async (req, res) => {
  await limiter.rejectOnQuotaExceededOrRecordUsage(); // will throw HttpsException with proper warnin
  const token = req.query.token;
  let userId = "";
  let newIpAddress = "";
  try {
    const querySnapshot = await db
      .collection("userLocations")
      .where("token", "==", token)
      .get();
    if (querySnapshot.empty) {
      console.log("Error");
      res.status(204).send({ error: "Link no longer valid" });
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
      batch.commit();
      res.status(200).send({
        message: "success",
      });
    });
  } catch (error) {
    console.log(error);
    res.status(500).send(error);
  }
});

/**
 * Server up and running!
 */
app.listen(PORT, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${PORT}`);
});

/**
 * Checks if this location is new for this user
 * @param userId Firebase UUID for the user
 * @param ipLocation Location that the user is logging in from
 */
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
/**
 *
 * @param userId Firebase UUID for the user
 * @param newIpAddress ip address that they are trying to log in from
 * @param token generated token that is associated with the new location
 */
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

/**
 *
 * @param userEmail user's email address
 * @param token generated token associated with the new location
 */
const emailLinkToUser = function (userEmail: string, token: string): boolean {
  //
  // Send an email to the user with the token in the format:
  // https://yourserveraddress.com/?token={token}
  //
  console.log(`Sending email to user ${userEmail} with token=${token}`);
  return true;
};

/**
 * Generate a UUID
 */
const CreateUUID = function (): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
