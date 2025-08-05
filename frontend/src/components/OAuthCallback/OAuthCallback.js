import React, { useEffect } from "react";
import { supabase } from "../SupabaseClient/SupabaseClient";

const OAuthCallback = () => {
  useEffect(() => {
    const syncUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const token = session?.access_token;

      if (!token) return;
      //   console.log("Access token:", token);

      // Gửi access token về backend
      await fetch("http://localhost:8000/sync_user", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // Redirect về trang chính
      window.location.href = "/";
    };

    syncUser();
  }, []);

  return;
};

export default OAuthCallback;
