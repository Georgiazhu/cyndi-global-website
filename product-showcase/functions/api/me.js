import { getAuthenticatedUser, json } from '../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) return json({ user: null }, 200);
  return json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      createdAt: user.created_at,
    },
  });
}
