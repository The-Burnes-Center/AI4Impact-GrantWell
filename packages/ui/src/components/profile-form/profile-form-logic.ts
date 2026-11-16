import type { ApplicantType, ProfileForm } from "../../common/instance";
import type { FormProfileInput } from "../../common/api-client/user-profile-client";

export type Answers = FormProfileInput;
export type AnswerField = "applicantType" | "organization" | "jobTitle" | "locations";

export const EMPTY_ANSWERS: Answers = { applicantType: "", organization: "", jobTitle: "", locations: [] };

export function typeOf(form: ProfileForm, name: string): ApplicantType | undefined {
  return form.applicantTypes.find((t) => t.name === name);
}

/** Picking a type drops answers it doesn't ask, and swaps one type's default role for the next's. */
export function withType(form: ProfileForm, answers: Answers, name: string): Answers {
  const before = typeOf(form, answers.applicantType);
  const after = typeOf(form, name);
  let jobTitle = answers.jobTitle;
  if (before?.defaultRole && jobTitle === before.defaultRole) jobTitle = "";
  if (after?.defaultRole && !jobTitle.trim()) jobTitle = after.defaultRole;
  return {
    applicantType: name,
    organization: before?.organization === after?.organization ? answers.organization : "",
    jobTitle,
    locations: after?.location ? answers.locations : [],
  };
}

/** The all option clears every other location, and any other location clears it. */
export function toggleLocation(form: ProfileForm, picked: string[], name: string): { locations: string[]; message: string } {
  const all = form.locations?.all ?? "";
  if (picked.includes(name)) return { locations: picked.filter((l) => l !== name), message: `${name} removed.` };
  if (name === all) {
    return { locations: [all], message: picked.length ? `${all} selected. Other choices cleared.` : `${all} selected.` };
  }
  if (picked.includes(all)) return { locations: [name], message: `${name} selected. ${all} cleared.` };
  return { locations: [...picked, name], message: `${name} selected.` };
}

export function problems(form: ProfileForm, answers: Answers): Partial<Record<AnswerField, string>> {
  const out: Partial<Record<AnswerField, string>> = {};
  const type = typeOf(form, answers.applicantType);
  if (!type) out.applicantType = "Choose your applicant type";
  if (type?.organization === "entity" && !form.entities?.choices.includes(answers.organization)) {
    out.organization = `Choose your ${form.entities?.label.toLowerCase() ?? "entity"} from the list`;
  }
  if (type?.organization === "name" && !answers.organization.trim()) out.organization = "Enter your organization name";
  if (!answers.jobTitle.trim()) out.jobTitle = "Enter your role";
  if (type?.location && answers.locations.length === 0) {
    out.locations = `Choose at least one ${form.locations?.label.toLowerCase() ?? "location"}`;
  }
  return out;
}

/** Each field's id, for focusing the first one with a problem. */
export function fieldId(idPrefix: string, field: AnswerField): string {
  return `${idPrefix}-${field}`;
}

/** Field order, for focusing the first problem. */
export const FIELD_ORDER: AnswerField[] = ["applicantType", "organization", "jobTitle", "locations"];

export function toInput(form: ProfileForm, answers: Answers): Answers {
  const type = typeOf(form, answers.applicantType);
  return {
    applicantType: answers.applicantType,
    organization: type && type.organization !== "none" ? answers.organization.trim() : "",
    jobTitle: answers.jobTitle.trim(),
    locations: type?.location ? answers.locations : [],
  };
}

export function sameAnswers(a: Answers, b: Answers): boolean {
  return (
    a.applicantType === b.applicantType &&
    a.organization.trim() === b.organization.trim() &&
    a.jobTitle.trim() === b.jobTitle.trim() &&
    a.locations.length === b.locations.length &&
    a.locations.every((l, i) => l === b.locations[i])
  );
}
