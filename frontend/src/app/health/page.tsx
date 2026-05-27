"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/apiClient";

export default function HealthPage() {
  const [loading, setLoading] = useState(true);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [version, setVersion] = useState<string | undefined>(undefined);

  useEffect(() => {
    apiClient.healthCheck()
      .then((res) => {
        setReachable(res.ok);
        setVersion(res.version);
      })
      .catch(() => {
        setReachable(false);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div style={{ padding: "20px", fontFamily: "sans-serif" }}>Checking backend health...</div>;
  }

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>Backend Health Status</h1>
      {reachable ? (
        <p style={{ color: "green", fontWeight: "bold" }}>Backend reachable</p>
      ) : (
        <p style={{ color: "red", fontWeight: "bold" }}>Backend unreachable</p>
      )}
      {version && (
        <p style={{ marginTop: "10px" }}>
          <strong>Version:</strong> {version}
        </p>
      )}
    </div>
  );
}
