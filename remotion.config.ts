// Remotion CLI config (studio + render). The reel uses inline styles, so no
// Tailwind/PostCSS wiring is needed here.
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setConcurrency(4);
