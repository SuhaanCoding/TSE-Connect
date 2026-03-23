import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import Navbar from "@/components/layout/Navbar";
import AdminDashboard from "@/components/admin/AdminDashboard";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) redirect("/");

  const admin = await isAdmin(user.email);
  if (!admin) redirect("/directory");

  return (
    <>
      <Navbar />
      <main className="pt-20 pb-16 px-6">
        <div className="max-w-7xl mx-auto">
          <AdminDashboard />
        </div>
      </main>
    </>
  );
}
