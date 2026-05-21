export type FuelingPaymentMethod = "Pix" | "Crédito" | "Débito" | "Linha de crédito";
export type FuelType = "AVGAS" | "Jet A" | "Jet A1";

export type FuelingResponsibleOption = {
  userId: string;
  label: string;
  email: string;
  role: "admin" | "instrutor";
};

export type FuelingStudentOption = {
  userId: string;
  label: string;
  email: string | null;
};

export type AircraftFueling = {
  id: string;
  school_id: string;
  occurred_at: string;
  aerodrome: string;
  responsible_user_id: string;
  responsible_name: string;
  aircraft_id: string;
  aircraft_registration: string;
  quantity_liters: number;
  price_per_liter: number;
  total_value: number;
  payment_method: FuelingPaymentMethod;
  fuel_type: FuelType;
  student_user_id: string | null;
  student_name: string | null;
  flight_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type CreateFuelingInput = Omit<AircraftFueling, "id" | "created_at" | "updated_at">;

export type FuelingFilters = {
  aircraftId?: string;
  responsibleUserId?: string;
  studentUserId?: string;
  fromDate?: string;
  toDate?: string;
};
