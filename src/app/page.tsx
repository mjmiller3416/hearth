import { redirect } from "next/navigation";
import { appConfig } from "@/lib/config";

// The wall's resting state is Calendar; `/` just forwards there.
export default function Home() {
  redirect(appConfig.defaultRoute);
}
