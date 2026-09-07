

// import supabase from "../../SupabaseClient";

// export const LoginCredentialsApi = async (formData) => {
//   const { data, error } = await supabase
//     .from('users')
//     .select('*')
//     .eq('user_name', formData.username)
//     .eq('password', formData.password)
//      .eq('status', 'active')
//     .single(); // get a single user

//   if (error || !data) {
//     return { error: 'Invalid username or password' };
//   }

//   return { data };
// };


import supabase from "../../SupabaseClient";

export const LoginCredentialsApi = async (formData) => {
  try {
    // 🔒 Try RPC first
    let userData = null;
    try {
      const { data, error } = await supabase
        .rpc('secure_login', {
          input_username: formData.username,
          input_password: formData.password
        });

      if (!error && Array.isArray(data) && data.length > 0) {
        userData = data[0];
      }
    } catch (rpcErr) {
      console.warn("RPC login attempt failed, falling back to direct query:", rpcErr);
    }

    // 🛡️ Fallback: Direct table query if RPC was not found or failed
    if (!userData) {
      const trimmedUser = (formData.username || '').trim();
      const { data: userRows, error: directErr } = await supabase
        .from('users')
        .select('*')
        .or(`user_name.ilike.${trimmedUser},username.ilike.${trimmedUser}`)
        .eq('password', formData.password)
        .limit(1);

      if (directErr) {
        // Retry with user_name only if username column doesn't exist
        const { data: retryRows, error: retryErr } = await supabase
          .from('users')
          .select('*')
          .ilike('user_name', trimmedUser)
          .eq('password', formData.password)
          .limit(1);

        if (!retryErr && retryRows?.length > 0) {
          userData = retryRows[0];
        } else {
          console.error("Direct login query error:", retryErr || directErr);
          return { error: 'Invalid username or password' };
        }
      } else if (userRows && userRows.length > 0) {
        userData = userRows[0];
      } else {
        return { error: 'Invalid username or password' };
      }
    }

    // 🔴 Change: Allow login for 'on_leave' users too. Only reject if status is specifically 'inactive'
    if (userData.status === 'inactive') {
      // Clear localStorage and reject login
      localStorage.clear();
      return { error: 'Your account is inactive. Please contact admin.' };
    }

    // Store user access in localStorage
    if (userData.user_access) {
      localStorage.setItem("user_access", userData.user_access);
    }

    return { data: userData };
  } catch (err) {
    console.error("Login Exception:", err);
    // 🌐 Handle DNS/ISP Blocks specifically for India users
    if (err.message === 'TypeError: Failed to fetch') {
      return { error: 'Connection Failed: Your ISP/DNS might be blocking Supabase (India Region issue). Please try using a VPN or switch to Cloudflare DNS (1.1.1.1).' };
    }
    return { error: 'An unexpected error occurred.' };
  }
};