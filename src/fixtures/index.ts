import type { Flow } from "@/schema";
import { acme3DeptAa } from "./acme3DeptAa";
import { acmeHqMultiDept } from "./acmeHqMultiDept";
import { ext401Screening } from "./ext401Screening";
import { riversideMedicalClinic } from "./riversideMedicalClinic";

export const FIXTURES: { label: string; flow: Flow }[] = [
  { label: "Acme HQ — multi-dept + holidays", flow: acmeHqMultiDept },
  { label: "Acme 3-dept AA", flow: acme3DeptAa },
  { label: "Riverside Medical Clinic", flow: riversideMedicalClinic },
  { label: "Extension 401 with screening", flow: ext401Screening },
];
