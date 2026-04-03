"use client";

import { CircularProgressbar } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";

export default function ScoreCard({ score = 75 }) {
  return (
    <div className="p-4 bg-white/10 rounded-xl text-center">
      <h2 className="mb-3 text-lg font-bold">🎯 Score</h2>

      <div className="w-32 mx-auto">
        <CircularProgressbar value={score} text={`${score}%`} />
      </div>
    </div>
  );
}