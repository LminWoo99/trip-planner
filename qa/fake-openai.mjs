// Stand-in for the OpenAI Responses API during E2E tests: answers by the requested schema name.
// /images/edits answers with a small fixed picture.
import { createServer } from "node:http";

const answers = {
  plan: (body) => {
    const text = JSON.stringify(body.input);
    return { days: [{ n: 2, items: [
      { time: "15:00", title: "호안끼엠 호수 산책", cat: "sight", place: "Hoan Kiem Lake", memo: "" },
      { time: "", title: "저녁: 분짜", cat: "food", place: "", memo: text.includes("분짜") ? "글에 있던 분짜" : "" },
    ] }] };
  },
  clothes: (body) => {
    const lines = JSON.parse(/옷: (\[.*\])/.exec(body.input[0].content[0].text)[1]);
    return { items: lines.map((t) => ({ text: t, slot: "top", label: "꽈배기 스웨터", color: "#e9c34a", sleeve: "long", length: "hip", fit: "wide", neck: "crew", closure: "none", texture: "rib", pattern: "none", shape: "-", detail: "-", style: "-" })) };
  },
  people: () => ({ people: [
    { position: 1, body: "m", build: "avg", hairStyle: "comma", glasses: "round", hairColor: "#1f1b1a", skin: "#f3d3bd", summary: "남자, 보통 체격, 쉼표머리, 동그란 안경" },
    { position: 2, body: "f", build: "slim", hairStyle: "hush", glasses: "none", hairColor: "#3b2a22", skin: "#f6dcc8", summary: "여자, 마른 체격, 허쉬컷" },
  ] }),
};

const PICTURE = "UklGRgQBAABXRUJQVlA4IPgAAADwCACdASpAAGAAPrVOoEonJKMhsViYAOAWiWUA0ExxR56UJK34BmyXxHCbMhIZQxUTVmEAvgmBKhpH9NKr6PqAa07D6lPogAcjOSiwTuAeEAD+9xy/FKfuRIWNoqxbYYk2qo6K15+v8w8ULW4tibwgOiByDPCGnNc1aATv/Q4mwkrTj+bYPeWfF5WZRuzJZFV+hmyr+B8vbR8AldZ/xjhz6x/Um2Db3/Sjsmth6Q5d86KsQnleI+MzP/RgSZ/B1hIfX8MiRc3QjOqOhLR1qWB3Mg43tDOlvrg27H23x2ISFlwOwUFufw8/E5uvBP/W3Y3GyOahtAAAAA==";

createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => { raw += c; });
  req.on("end", () => {
    const body = JSON.parse(raw || "{}");
    if (req.url.endsWith("/images/edits")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ b64_json: PICTURE }], prompt: body.prompt }));
      return;
    }
    const name = body.text?.format?.name;
    const out = answers[name] ? answers[name](body) : {};
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(out) }] }] }));
  });
}).listen(8099, "127.0.0.1");
