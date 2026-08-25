import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function AuthPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus("");
    setLoading(true);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
            },
          },
        });

        if (error) throw error;

        if (data.user) {
          const { error: profileError } = await supabase
            .from("profiles")
            .insert({
              id: data.user.id,
              email,
              full_name: fullName.trim(),
            });

          if (profileError && profileError.code !== "23505") {
            throw profileError;
          }
        }

        setStatus("Account created. You are now signed in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
      }
    } catch (error) {
      setStatus(error.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="auth-brand">NATHAN AI</p>
        <h1>{isSignUp ? "Create your account" : "Welcome back"}</h1>
        <p className="auth-subtitle">
          {isSignUp
            ? "Start using your personal AI workspace."
            : "Sign in to continue to Nathan AI."}
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          {isSignUp && (
            <label>
              Full name
              <input
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Your name"
                required
              />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 6 characters"
              minLength="6"
              required
            />
          </label>

          {status && <p className="auth-status">{status}</p>}

          <button type="submit" disabled={loading}>
            {loading
              ? "Please wait..."
              : isSignUp
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        <button
          type="button"
          className="auth-switch"
          onClick={() => {
            setIsSignUp(!isSignUp);
            setStatus("");
          }}
        >
          {isSignUp
            ? "Already have an account? Sign in"
            : "New here? Create an account"}
        </button>
      </section>
    </main>
  );
}