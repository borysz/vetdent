import { z } from "zod";

/** Translation keys under `onboarding.validation`. */
export type OrganizationValidationKey = "typeRequired" | "nameRequired" | "taxNumberRequired" | "tooLong";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "tooLong" satisfies OrganizationValidationKey);

export const createOrganizationSchema = z
  .object({
    type: z.enum(["clinic", "individual"], "typeRequired" satisfies OrganizationValidationKey),
    name: z
      .string()
      .trim()
      .min(1, "nameRequired" satisfies OrganizationValidationKey)
      .max(200, "tooLong" satisfies OrganizationValidationKey),
    taxNumber: optionalText(50),
    postalCode: optionalText(20),
    city: optionalText(100),
    addressLine: optionalText(200),
    phone: optionalText(50),
    ownerIsClinician: z.boolean(),
  })
  .superRefine((value, context) => {
    // A clinic is invoiced as a business, so its tax number is mandatory.
    if (value.type === "clinic" && value.taxNumber.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["taxNumber"],
        message: "taxNumberRequired" satisfies OrganizationValidationKey,
      });
    }
  });

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
