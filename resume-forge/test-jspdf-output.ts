import { jsPDF } from 'jspdf';
const pdf = new jsPDF();
pdf.text("Hello", 10, 10, { renderingMode: "invisible" });
pdf.text("World", 10, 20, { renderingMode: 3 });
console.log(pdf.output().substring(0, 500));
