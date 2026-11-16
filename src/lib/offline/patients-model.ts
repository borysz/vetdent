/**
 * Patients (the animals) on the device: the generic record rules (see
 * `record-model.ts`) bound to the fields of a patient.
 */

import { recordOps, type LocalRow, type RecordSpec, type RecordView, type ServerRecord } from "./record-model";

export const SPECIES_VALUES = ["dog", "cat"] as const;
export type PatientSpecies = (typeof SPECIES_VALUES)[number];

export const SEX_VALUES = ["male", "female", "unknown"] as const;
export type PatientSex = (typeof SEX_VALUES)[number];

export const PATIENT_FIELDS = [
  "clientId",
  "name",
  "species",
  "breed",
  "birthDate",
  "sex",
  "neutered",
  "weightKg",
  "microchip",
  "notes",
] as const;
export type PatientField = (typeof PATIENT_FIELDS)[number];

export interface PatientFields {
  /** Id of the owner (a client). */
  clientId: string;
  name: string;
  species: PatientSpecies;
  breed: string | null;
  /** `YYYY-MM-DD`. */
  birthDate: string | null;
  sex: PatientSex;
  neutered: boolean;
  weightKg: number | null;
  microchip: string | null;
  notes: string | null;
}

export const PATIENT_WIRE_FIELD: Readonly<Record<PatientField, string>> = {
  clientId: "client_id",
  name: "name",
  species: "species",
  breed: "breed",
  birthDate: "birth_date",
  sex: "sex",
  neutered: "neutered",
  weightKg: "weight_kg",
  microchip: "microchip",
  notes: "notes",
};

export const EMPTY_PATIENT_FIELDS: PatientFields = {
  clientId: "",
  name: "",
  species: "dog",
  breed: null,
  birthDate: null,
  sex: "unknown",
  neutered: false,
  weightKg: null,
  microchip: null,
  notes: null,
};

export const patientSpec: RecordSpec<PatientFields> = {
  fields: PATIENT_FIELDS,
  wire: PATIENT_WIRE_FIELD,
  empty: EMPTY_PATIENT_FIELDS,
};

export type ServerPatient = ServerRecord<PatientFields>;
export type LocalPatientRow = LocalRow<PatientFields>;
export type PatientView = RecordView<PatientFields>;

export const patientOps = recordOps(patientSpec);
