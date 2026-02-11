import React from "react";

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("RENDER CRASH:", error);
  }

  render() {
    const { error } = this.state;

    if (error) {
      return (
        <div style={{ padding: 32, background: "#111", color: "red" }}>
          <h1>RENDER CRASH</h1>
          <pre>{error.stack ?? error.message}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}
