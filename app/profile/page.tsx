import { redirect } from "next/navigation";

export default function ProfilePage() {
  // Profile editing now lives at /settings
  redirect("/settings");
}
