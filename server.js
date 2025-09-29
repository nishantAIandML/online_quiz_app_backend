import express from "express";
import { Server } from "socket.io";
import http from "http";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL},
});

let currentQuestion = null;
let students = {};
let pollResults = {};
let timer = null;
let timerInterval = null;

// Teacher submits question
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  // Teacher sends new question
  socket.on("teacher:sendQuestion", (questionData) => {
    currentQuestion = questionData;
    pollResults = {};
    
    // Initialize poll results for each option
    questionData.options.forEach(opt => {
      pollResults[opt.text] = 0;
    });

    console.log("📝 Question received:", questionData);
    console.log("📊 Initial poll results:", pollResults);

    // Broadcast question to all students
    io.emit("student:newQuestion", { question: questionData, time: 60 });
    
    // Send initial poll results to teacher
    socket.emit("teacher:pollUpdate", pollResults);

    // Start 60s timer with countdown
    let timeLeft = 60;
    io.emit("teacher:timerUpdate", timeLeft);
    
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      timeLeft--;
      io.emit("teacher:timerUpdate", timeLeft);
      
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        io.emit("student:timeUp");
        io.emit("teacher:questionEnded", pollResults);
        currentQuestion = null;
      }
    }, 1000);
  });

  // Student joins quiz
  socket.on("student:join", (studentName) => {
    students[socket.id] = { name: studentName, score: 0 };
    console.log(`🎓 Student joined: ${studentName}`);
    
    // Send updated leaderboard to all students
    const sortedStudents = Object.values(students).sort((a, b) => b.score - a.score);
    console.log("📊 Broadcasting leaderboard:", sortedStudents);
    io.emit("student:leaderboard", sortedStudents);
  });

  // Student sends answer
  socket.on("student:answer", (answer) => {
    if (!currentQuestion) {
      console.log("❌ No active question, ignoring answer");
      return;
    }

    console.log(`📝 Student ${socket.id} answered:`, answer);

    // Check if answer is correct and update score
    if (answer === currentQuestion.correctAnswer && students[socket.id]) {
      students[socket.id].score += 10; // Award 10 points for correct answer
      console.log(`✅ Correct answer! ${students[socket.id].name} scored 10 points`);
    }

    // Update poll results
    if (pollResults[answer] !== undefined) {
      pollResults[answer]++;
      console.log("📊 Updated poll results:", pollResults);
      
      // Broadcast updated results to teacher
      io.emit("teacher:pollUpdate", pollResults);
      
      // Send updated leaderboard to all students
      const sortedStudents = Object.values(students).sort((a, b) => b.score - a.score);
      console.log("📊 Broadcasting leaderboard after answer:", sortedStudents);
      io.emit("student:leaderboard", sortedStudents);
    } else {
      console.log("❌ Invalid answer option:", answer);
    }
  });

  socket.on("disconnect", () => {
    console.log("👋 Client disconnected:", socket.id);
    delete students[socket.id];
    
    // Send updated leaderboard to remaining students
    const sortedStudents = Object.values(students).sort((a, b) => b.score - a.score);
    console.log("📊 Broadcasting leaderboard after disconnect:", sortedStudents);
    io.emit("student:leaderboard", sortedStudents);
  });
});

server.listen(8000, () => {
  console.log("Server running on port 8000");
});
