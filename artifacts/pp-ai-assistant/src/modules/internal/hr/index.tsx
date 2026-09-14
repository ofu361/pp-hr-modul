// © 2026 P&P Group. Proprietary & Confidential.
import { useEffect } from "react";
import { useLocation } from "wouter";
export default function HrIndex() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate("/hr/dashboard"); }, [navigate]);
  return null;
}
