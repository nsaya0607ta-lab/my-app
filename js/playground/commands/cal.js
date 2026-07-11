import { LINE, padStart } from './_util.js';

const MONTH_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function rowLine(cells, todayIdx){
  if(todayIdx === -1) return LINE(cells.join(" "));
  const tokens = [];
  cells.forEach((cell, i) => {
    if(i > 0) tokens.push({ text:" " });
    tokens.push(i === todayIdx ? { text:cell, cls:"pg-cal-today" } : { text:cell });
  });
  return tokens;
}

export default function cal(){
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth(), today = now.getDate();
  const startDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days = [];
  for(let i = 0; i < startDow; i++) days.push(null);
  for(let day = 1; day <= daysInMonth; day++) days.push(day);
  while(days.length % 7 !== 0) days.push(null);

  const title = `${MONTH_FULL[month]} ${year}`;
  const leftPad = Math.max(0, Math.floor((20 - title.length) / 2));
  const lines = [
    LINE(" ".repeat(leftPad) + title),
    LINE("Su Mo Tu We Th Fr Sa"),
  ];
  for(let r = 0; r < days.length / 7; r++){
    const week = days.slice(r * 7, r * 7 + 7);
    const todayIdx = week.findIndex(d => d === today);
    lines.push(rowLine(week.map(d => d === null ? "  " : padStart(d, 2)), todayIdx));
  }
  return { lines, err:[] };
}
