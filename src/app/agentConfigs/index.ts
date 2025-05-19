import { AllAgentConfigsType } from "@/app/types";
import frontDeskAuthentication from "./frontDeskAuthentication";
import customerServiceRetail from "./customerServiceRetail";
import simpleExample from "./simpleExample";
import medicalHistoryTaking from "./medicalHistoryTaking";

export const allAgentSets: AllAgentConfigsType = {
  frontDeskAuthentication,
  customerServiceRetail,
  simpleExample,
  medicalHistoryTaking,
};

export const defaultAgentSetKey = "medicalHistoryTaking";
