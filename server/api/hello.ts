import { defineHandler } from "nitro/h3";

export default defineHandler(() => {
  console.log("GET /api/hello called");

  return "Hello from Nitro API!";
});
