import express from "express";
import firebase from "firebase/app";
import "firebase/auth";
import bodyParser from "body-parser";
import firebaseConfig from "./config/default";

firebase.initializeApp(firebaseConfig);
type UserCredentials = {
  username: string;
  password: string;
};

const PORT = process.env.PORT || 3000;
const app = express();

app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.send(req.url);
});

app.post("/login", async (req, res) => {
  const userCredentials: UserCredentials = req.body;
  try {
    const user = await firebase
      .auth()
      .signInWithEmailAndPassword(
        userCredentials.username,
        userCredentials.password
      );
    res.send(user);
  } catch (error) {
    res.send({ error: "Something went wrong" });
  }
});

app.listen(PORT, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${PORT}`);
});
