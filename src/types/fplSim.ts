export type FplPlanKind = "pvs" | "pvc";
export type FplPlanStatus = "draft" | "valid" | "invalid";

export type FplItem19 = {
  endurance: string;
  personsOnBoard: string;
  radioU: boolean;
  radioV: boolean;
  radioE: boolean;
  survivalS: boolean;
  survivalP: boolean;
  survivalD: boolean;
  survivalM: boolean;
  survivalJ: boolean;
  jacketJ: boolean;
  jacketL: boolean;
  jacketF: boolean;
  jacketU: boolean;
  jacketV: boolean;
  dinghyD: boolean;
  dinghyNumber: string;
  dinghyCapacity: string;
  dinghyCover: boolean;
  dinghyColor: string;
  aircraftColor: string;
  remarks: string;
  picName: string;
  anac1: string;
  anac2: string;
  phone: string;
};

export type FplPlanForm = {
  kind: FplPlanKind;
  aircraftId: string;
  callsignEnabled: boolean;
  callsign: string;
  flightRules: string;
  flightType: string;
  number: string;
  aircraftType: string;
  wake: string;
  eq10a: string[];
  eq10b: string[];
  depAd: string;
  depTime: string;
  destAd: string;
  eet: string;
  altn: string;
  altn2: string;
  cruiseSpeed: string;
  level: string;
  route: string;
  dof: string;
  item18Keys: string[];
  item18: Record<string, string>;
  item19: FplItem19;
};

export type FplSavedPlan = {
  id: string;
  userId: string;
  schoolId: string;
  status: FplPlanStatus;
  form: FplPlanForm;
  lastErrors: string[];
  createdAt: string;
  updatedAt: string;
};

export type FplValidationIssue = {
  fieldId: string;
  severity: "error" | "warning";
  message: string;
  mcaRef?: string;
};

export type FplHelpEntry = {
  id: string;
  title: string;
  mcaRef: string;
  body: string;
};

export type FplProTips = Record<string, string>;
