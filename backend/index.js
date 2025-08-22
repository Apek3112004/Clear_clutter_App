import express from "express";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
// express-rate-limit → Middleware to limit repeated requests from the same IP (security against brute-force attacks).
import session from "express-session";
// express-session → Middleware to handle user sessions.
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

app.use(
  /*A client (browser/Electron window) makes a request without a session cookie.
  express-session sees no existing session.It generates a new, unique session ID. */
  session({
    secret: process.env.SESSION_SECRET || "fallback-secret",
    resave: false,//Don’t save session if unmodified (performance).
    saveUninitialized: true,//Save new sessions even if unmodified.
    cookie: { secure: false },
    /*Sessions allow tracking user state across multiple requests. 
    They are identified by a session ID cookie per client, so multiple tabs in the same browser share a session, while different browsers or devices get separate sessions.
    In Electron, by default, multiple windows share the same session unless partitioning is used. */
  })
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.sessionID, 
  message: "Too many requests from this session",
});


app.use(limiter);
app.use("/", router);

// ✅ Export app without listening
export default app;
