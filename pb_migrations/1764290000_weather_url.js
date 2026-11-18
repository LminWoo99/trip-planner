/// <reference path="../pb_data/types.d.ts" />

// A forecast page per day (e.g. a mountain forecast site) shown under the day's weather.
migrate((app) => {
  const days = app.findCollectionByNameOrId("days");
  days.fields.add(new URLField({ name: "weatherUrl" }));
  app.save(days);
  // the Fansipan day used a link built into the app; keep it as that day's link
  for (const d of app.findRecordsByFilter("days", "title ~ '판시판'", "", 0, 0)) {
    d.set("weatherUrl", "https://www.mountain-forecast.com/peaks/Fan-Si-Pan/forecasts/3211");
    app.saveNoValidate(d);
  }
}, (app) => {
  const days = app.findCollectionByNameOrId("days");
  days.fields.removeByName("weatherUrl");
  app.save(days);
});
