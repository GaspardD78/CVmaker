import { jsPDF } from 'jspdf';
const pdf = new jsPDF();
pdf.text("Hello", 10, 10, { renderingMode: "invisible" });
console.log(pdf.output().indexOf("3 Tr"));
