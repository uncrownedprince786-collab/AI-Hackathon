import { permanentRedirect } from "next/navigation";

/**
 * The trust page lives at /methodology. This older path is kept as a permanent
 * redirect so existing links and search results land on the canonical page.
 */
export default function HowWeCollectDataRedirect() {
  permanentRedirect("/methodology");
}
