/// <reference path="../../../pb_data/types.d.ts" />
// GENERATED from shared/receipts.ts by scripts/gen-hooks.mjs. Don't edit:
// change shared/receipts.ts and run `pnpm gen:hooks`.
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// shared/receipts.ts
var receipts_exports = {};
__export(receipts_exports, {
  RECEIPTS_PER_PERSON: () => RECEIPTS_PER_PERSON,
  RECEIPTS_PER_TRANSACTION: () => RECEIPTS_PER_TRANSACTION,
  RECEIPT_MAX_BYTES: () => RECEIPT_MAX_BYTES,
  RECEIPT_NAME_MAX: () => RECEIPT_NAME_MAX,
  RECEIPT_TYPES: () => RECEIPT_TYPES,
  checkReceipt: () => checkReceipt,
  receiptFileName: () => receiptFileName,
  receiptName: () => receiptName,
  sniff: () => sniff
});
module.exports = __toCommonJS(receipts_exports);
var RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
var RECEIPTS_PER_TRANSACTION = 5;
var RECEIPTS_PER_PERSON = 500;
var RECEIPT_NAME_MAX = 100;
var RECEIPT_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf"
};
var starts = (b, at, text) => b.length >= at + text.length && [...text].every((c, i) => b[at + i] === c.charCodeAt(0));
function sniff(bytes) {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes[0] === 137 && starts(bytes, 1, "PNG")) return "image/png";
  if (starts(bytes, 0, "RIFF") && starts(bytes, 8, "WEBP")) return "image/webp";
  if (starts(bytes, 0, "%PDF-")) return "application/pdf";
  if (starts(bytes, 4, "ftyp")) {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    if (["heic", "heix", "heim", "heis"].includes(brand)) return "image/heic";
    if (["mif1", "msf1", "heif"].includes(brand)) return "image/heif";
  }
  return "";
}
function receiptName(name, type) {
  var _a;
  const clean = [...typeof name === "string" ? name : ""].map((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || '"\\/'.includes(c) ? " " : c).join("").replace(/\s+/g, " ").trim().slice(0, RECEIPT_NAME_MAX);
  return clean || `Receipt.${(_a = RECEIPT_TYPES[type]) != null ? _a : "bin"}`;
}
function checkReceipt(name, bytes) {
  if (!bytes.length) return { problem: "Choose the receipt again: the file was empty." };
  if (bytes.length > RECEIPT_MAX_BYTES) return { problem: `A receipt can be at most ${RECEIPT_MAX_BYTES / 1024 / 1024} MB.` };
  const type = sniff(bytes);
  if (!type) return { problem: "A receipt is a photo (JPEG, PNG, WebP or HEIC) or a PDF." };
  return { ok: { name: receiptName(name, type), type } };
}
function receiptFileName(posted, id, name, type) {
  var _a;
  const ext = (_a = RECEIPT_TYPES[type]) != null ? _a : "bin";
  const base = name.replace(/\.[A-Za-z0-9]{1,5}$/, "").replace(/[^A-Za-z0-9 ._-]+/g, "").trim().slice(0, 60) || "receipt";
  return `${posted.slice(0, 10)} ${base} ${id}.${ext}`;
}
