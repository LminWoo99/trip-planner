// Stand-in for the OpenAI Responses API during E2E tests: answers by the requested schema name.
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
    return { items: lines.map((t) => ({ text: t, type: "knit", color: "#e9c34a" })) };
  },
  coord: () => ({ text: "비 소식이 있으니 방수 신발이 좋아요. 둘 다 어두운 하의라 톤이 잘 맞아요." }),
  people: () => ({ people: [
    { position: 1, body: "m", build: "avg", hair: "short", hairColor: "#1f1b1a", skin: "#f3d3bd", summary: "남자, 보통 체격, 짧은 검은 머리" },
    { position: 2, body: "f", build: "slim", hair: "long", hairColor: "#3b2a22", skin: "#f6dcc8", summary: "여자, 마른 체격, 긴 갈색 머리" },
  ] }),
};

createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => { raw += c; });
  req.on("end", () => {
    const body = JSON.parse(raw || "{}");
    const name = body.text?.format?.name;
    const out = answers[name] ? answers[name](body) : {};
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(out) }] }] }));
  });
}).listen(8099, "127.0.0.1");
