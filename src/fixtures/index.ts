import type { Flow } from "@/schema";
import { acme3DeptAa } from "./acme3DeptAa";
import { acmeHqMultiDept } from "./acmeHqMultiDept";
import { ext401Screening } from "./ext401Screening";

export const FIXTURES: { label: string; flow: Flow }[] = [
  { label: "Acme HQ — multi-dept + holidays", flow: acmeHqMultiDept },
  { label: "Acme 3-dept AA", flow: acme3DeptAa },
  { label: "Extension 401 with screening", flow: ext401Screening },
];
