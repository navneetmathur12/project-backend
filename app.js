const express = require("express");
const app = express();
const path = require("path");
const usermodel = require("./models/user");
const postmodel = require("./models/post");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
require("dotenv").config();
const upload = require("./config/multerconfig");

app.use(express.json());
app.use(express.urlencoded({ extended: "true" }));
app.use(express.static(path.join(__dirname, "public")));
app.use(cookieParser());
app.set("view engine", "ejs");

app.get("/", (req, res) => {
  res.render("index");
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.get("/profile/upload", (req, res) => {
  res.render("profileupload");
});

app.post("/upload", isLoggedIn, upload.single("image"), async (req, res) => {
  try {
    console.log("FILE:", req.file);

    if (!req.file) {
      return res.send("No file uploaded ❌");
    }

    let user = await usermodel.findById(req.user.id);

    if (!user) {
      return res.send("User not found ❌");
    }

    // 👇 DB me filename save
    user.profilepic = req.file.filename;

    await user.save();

    console.log("Saved in DB:", user.profilepic); // ✅ check

    res.redirect("/profile");
  } catch (err) {
    console.log(err);
    res.status(500).send("profile pic not update");
  }
});

app.get("/profile", isLoggedIn, async (req, res) => {
  try {
    let user = await usermodel.findById(req.user.id).populate("posts");
    if (!user) return res.send("user not find");
    res.render("profile", { user });
  } catch (err) {
    res.send("profile not open");
  }
});

app.get("/edit/:id", async (req, res) => {
  try {
    let post = await postmodel.findById(req.params.id);
    res.render("edit", { post });
  } catch (err) {
    res.status(400).send(err.message);
  }
});

app.post("/register", async (req, res) => {
  try {
    let { email, password, name, username, age } = req.body;
    if (!email || !username || !password) {
      res.send("all filds are required");
      return;
    }
    let user = await usermodel.findOne({ email });
    if (user) return res.status(402).send("user already registered");
    let salt = await bcrypt.genSalt(10);
    let hash = await bcrypt.hash(password, salt);
    let NewUser = await usermodel.create({
      username,
      name,
      age,
      email,
      password: hash,
    });
    let token = jwt.sign(
      { email: email, id: NewUser._id },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );
    res.cookie("token", token, {
      httpOnly: true,
      secure: false,
      sameSite: "strict",
    });
    res.redirect("/profile");
  } catch (err) {
    res.status(500).send("register fail");
  }
});

app.post("/login", async (req, res) => {
  try {
    let { email, password } = req.body;
    let user = await usermodel.findOne({ email });
    if (!user) return res.status(400).send("user not found");
    bcrypt.compare(password, user.password, function (err, result) {
      if (result) {
        let token = jwt.sign(
          { email: email, id: user._id },
          process.env.JWT_SECRET,
          { expiresIn: "1d" },
        );

        res.cookie("token", token, {
          httpOnly: true,
          secure: false,
          sameSite: "strict",
        });
        res.redirect("/profile");
      } else {
        res.send("login fallid");
      }
    });
  } catch (err) {
    res.status(500).send("login problem");
  }
});

function isLoggedIn(req, res, next) {
  if (!req.cookies.token) {
    return res.redirect("/login");
  }
  try {
    let data = jwt.verify(req.cookies.token, process.env.JWT_SECRET);
    req.user = data;
    next();
  } catch (err) {
    res.status(500).send(err.message);
  }
}

app.post("/like/:id", isLoggedIn, async (req, res) => {
  try {
    let post = await postmodel.findById(req.params.id);
    let liked = false;

    // convert sabko string me compare karo
    const userId = req.user.id;

    if (!post.likes.some((id) => id.toString() === userId)) {
      post.likes.push(userId);
      liked = true;
    } else {
      post.likes = post.likes.filter((id) => id.toString() !== userId);
    }

    await post.save();

    res.json({
      likes: post.likes.length,
      liked,
    });
  } catch (err) {
    res.status(500).send({ err: "like failed" });
  }
});

app.post("/post", isLoggedIn, async (req, res) => {
  try {
    let user = await usermodel.findById(req.user.id);
    let { content } = req.body;
    let post = await postmodel.create({
      user: user._id,
      content,
    });
    user.posts.push(post._id);
    await user.save();
    res.redirect("/profile");
  } catch (err) {
    res.send("profile not matched");
  }
});

app.post("/update/:id", isLoggedIn, async (req, res) => {
  try {
    let post = await postmodel.findById(req.params.id);
    if (!post || post.user.toString() !== req.user.id) {
      res.status(403).send("Unauthorized");
    }
    post.content = req.body.content;
    await post.save();
    res.redirect("/profile");
  } catch (err) {
    res.send("err", "update failed");
  }
});

app.post("/delete-profile-pic", isLoggedIn, async (req, res) => {
  try {
    let user = await usermodel.findById(req.user.id);

    if (!user.profilepic) {
      console.log("No profile picture set for user");
      return res.send("No profile picture found ❌");
    }

    const fs = require("fs");
    const path = require("path");

    let filePath = path.join(
      __dirname,
      "public",
      "image",
      "upload",
      user.profilepic,
    );

    console.log("Deleting file:", filePath);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log("File deleted ✅");
    } else {
      console.log("File does not exist on disk ❌");
    }

    user.profilepic = "";
    await user.save();

    res.redirect("/profile");
  } catch (err) {
    console.error("Error deleting profile pic:", err);
    res.status(500).send("Error deleting profile picture");
  }
});

app.post("/comment/:id", isLoggedIn, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).send("Comment cannot be empty");

    let post = await postmodel.findById(req.params.id);
    if (!post) return res.status(404).send("Post not found");

    post.comments.push({
      user: req.user.id,
      text,
    });

    await post.save();
    await post.populate("comments.user", "username");
    res.json({
      success: true,
      comment: post.comments[post.comments.length - 1], // return the last comment
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to add comment");
  }
});

app.get("/logout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/login");
});

app.listen(3000, (req, res) => {
  console.log("server running ");
});
