import { defineHandler, readValidatedBody } from "nitro/h3";
import * as v from "valibot";

const Schema = v.object({
  echo: v.pipe(v.string('Input must be a string'), v.trim(), v.nonEmpty('Input cannot be empty')),
})

export default defineHandler(async (event) => {
  const { echo } = await readValidatedBody(event, Schema);
  console.log("Received echo:", echo);

  return { echoed: echo };
});
