// OpenAI image edits (gpt-image): a picture made from reference pictures and a prompt.

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function b64ToBytes(s) {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12) | ((B64.indexOf(clean[i + 2]) & 63) << 6) | (B64.indexOf(clean[i + 3]) & 63);
    out[o++] = (n >> 16) & 255;
    if (i + 2 < clean.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < clean.length) out[o++] = n & 255;
  }
  out.length = o;
  return out;
}

function bytesToB64(b) {
  let s = "";
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] || 0) << 8) | (b[i + 2] || 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : "=") + (i + 2 < b.length ? B64[n & 63] : "=");
  }
  return s;
}

/** Checks a data URL from the client and returns it, or throws. */
function picture(dataUrl, maxLen) {
  const s = String(dataUrl || "");
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s)) throw new BadRequestError("사진 형식을 읽을 수 없어요. JPG나 PNG로 골라 주세요.");
  if (s.length > (maxLen || 4 * 1024 * 1024)) throw new BadRequestError("사진이 너무 커요.");
  return s;
}

/** A webp file for a file field, from a data URL. */
function fileFromDataUrl(dataUrl, name) {
  return $filesystem.fileFromBytes(b64ToBytes(dataUrl.slice(dataUrl.indexOf(",") + 1)), name);
}

/** A stored file of a record as a data URL (to send it back to the model). */
function recordFileDataUrl(app, record, field) {
  const name = record.getString(field);
  if (!name) return "";
  const fsys = app.newFilesystem();
  try {
    const r = fsys.getReader(record.baseFilesPath() + "/" + name);
    try {
      const ext = name.split(".").pop().toLowerCase();
      return "data:image/" + (ext === "jpg" ? "jpeg" : ext) + ";base64," + bytesToB64(toBytes(r));
    } finally {
      r.close();
    }
  } finally {
    fsys.close();
  }
}

/** Calls the image edits endpoint; returns the new picture as a webp data URL. */
function editImage(images, prompt, size) {
  const key = $os.getenv("OPENAI_API_KEY");
  if (!key) throw new BadRequestError("AI 설정이 아직 안 돼 있어요.");
  const res = $http.send({
    url: ($os.getenv("OPENAI_BASE_URL") || "https://api.openai.com/v1") + "/images/edits",
    method: "POST",
    timeout: 180,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({
      model: $os.getenv("OPENAI_IMAGE_MODEL") || "gpt-image-2",
      images: images.map((u) => ({ image_url: u })),
      prompt,
      size,
      quality: "medium",
      output_format: "webp",
      output_compression: 82,
    }),
  });
  if (res.statusCode !== 200) {
    console.log("openai image error", res.statusCode, toString(res.body).slice(0, 300));
    throw new BadRequestError("그림을 만들지 못했어요. 잠시 뒤 다시 해 주세요.");
  }
  const b64 = res.json.data && res.json.data[0] && res.json.data[0].b64_json;
  if (!b64) throw new BadRequestError("그림을 받지 못했어요. 다시 해 주세요.");
  return "data:image/webp;base64," + b64;
}

module.exports = { picture, fileFromDataUrl, recordFileDataUrl, editImage };
