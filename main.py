# /// script
# dependencies = [
#     "langgraph",
#     "langchain-groq",
#     "pandas",
# ]
# ///

import os
import json
import math
import pandas as pd
from typing import TypedDict, Dict, Any

# LangChain & LangGraph official imports
from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq
from langgraph.graph import StateGraph, START, END
from dotenv import load_dotenv

# Load your uploaded CSV data
df = pd.read_csv("Hospitals.csv")
load_dotenv()
key=os.getenv("GROQ_API_KEY")

# -------------------------------------------------------------
# STEP 1: Define the Shared Graph State
# -------------------------------------------------------------
class MediRelayState(TypedDict):
    # Inputs
    raw_symptoms: str
    patient_lat: float
    patient_lng: float

    # Agent 1 Outputs (Triage)
    severity_level: str
    suspected_condition: str
    required_specialist: str

    # Agent 2 Outputs (Hospital Finder)
    selected_hospital: Dict[str, Any]

    # Agent 3 Outputs (Ambulance Router)
    eta_minutes: float
    route_details: str

    # Agent 4 Outputs (Doctor Brief)
    doctor_brief: str


# -------------------------------------------------------------
# STEP 2: Define Agent Nodes (Functions) Using Groq Models
# -------------------------------------------------------------

def agent_1_triage(state: MediRelayState) -> Dict[str, Any]:
    """Agent 1: Analyzes clinical symptoms using Groq Llama 3."""
    # Using Llama 3 70B via Groq for highly complex triage intelligence
    llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0,api_key=key)

    prompt = ChatPromptTemplate.from_messages([
        ("system", (
            "You are an expert ER Medical Triage Officer.\n"
            "Analyze the patient symptoms and output JSON format ONLY with keys:\n"
            "'severity_level' (CRITICAL, URGENT, STABLE), \n"
            "'suspected_condition' (e.g., STEMI Heart Attack, Stroke, Seizure), \n"
            "'required_specialist' (Cardiologist, Neurologist, General Physician, Pediatrician)"
        )),
        ("human", "{symptoms}")
    ])

    chain = prompt | llm
    response = chain.invoke({"symptoms": state["raw_symptoms"]})

    # Clean up JSON formatting artifacts from LLM text string
    clean_content = response.content.replace("```json", "").replace("```", "").strip()
    data = json.loads(clean_content)

    return {
        "severity_level": data["severity_level"],
        "suspected_condition": data["suspected_condition"],
        "required_specialist": data["required_specialist"]
    }


def agent_2_hospital_finder(state: MediRelayState) -> Dict[str, Any]:
    """Agent 2: Scans your local Hospitals.csv dataset using localized coordinates."""
    p_lat = state["patient_lat"]
    p_lng = state["patient_lng"]
    req_specialist = state["required_specialist"]

    best_hospital = None
    min_distance = float('inf')

    # Vectorized check loop over rows of your uploaded Hospitals.csv dataset
    for _, row in df.iterrows():
        h_lat = float(row["Latitude"])
        h_lng = float(row["Longitude"])

        # Straight line approximation mapping coordinate distance to Kms
        distance = math.sqrt((p_lat - h_lat) ** 2 + (p_lng - h_lng) ** 2) * 111

        # Filtering logic for best hospital fit (using 3.5 rating fallback threshold)
        if distance < min_distance and float(row["Rating"]) >= 3.5:
            min_distance = distance
            best_hospital = {
                "id": row["id"],
                "name": f"Hospital #{row['id'].split('#')[-1]} ({row['City']})",
                "lat": h_lat,
                "lng": h_lng,
                "rating": row["Rating"]
            }

    return {"selected_hospital": best_hospital}


def agent_3_ambulance_coordinator(state: MediRelayState) -> Dict[str, Any]:
    """Agent 3: Calculates optimized routes and returns ETA metrics."""
    hosp = state["selected_hospital"]
    p_lat = state["patient_lat"]
    p_lng = state["patient_lng"]

    # Simulating ambulance distance computation
    distance_kms = math.sqrt((p_lat - hosp["lat"]) ** 2 + (p_lng - hosp["lng"]) ** 2) * 111
    estimated_eta = (distance_kms / 30) * 60 + 3  # Ambulance pacing + dispatch delay multiplier

    return {
        "eta_minutes": round(estimated_eta, 1),
        "route_details": f"Fastest route locked via Green Corridor straight to {hosp['name']}."
    }


def agent_4_doctor_briefing(state: MediRelayState) -> Dict[str, Any]:
    """Agent 4: Synthesizes final medical handoff brief for the waiting ER room via Groq."""
    # Using Llama 8B for fast execution speeds on simple text summarization tasks
    llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.2,api_key=key)

    prompt = ChatPromptTemplate.from_messages([
        ("system", (
            "You are a clinical coordinator drafting an emergency heads-up brief for incoming ER doctors.\n"
            "Summarize the patient case cleanly. Mention symptoms, priority tier, and ETA.\n"
            "Keep it crisp, highly actionable, and structured with short bullet points."
        )),
        ("human", "Symptoms: {symptoms}\nSuspected: {cond}\nSeverity: {sev}\nETA: {eta} minutes")
    ])

    chain = prompt | llm
    brief = chain.invoke({
        "symptoms": state["raw_symptoms"],
        "cond": state["suspected_condition"],
        "sev": state["severity_level"],
        "eta": state["eta_minutes"]
    })

    return {"doctor_brief": brief.content}


# -------------------------------------------------------------
# STEP 3: Setup LangGraph Pipeline Workflow
# -------------------------------------------------------------
workflow = StateGraph(MediRelayState)

# Append functional agent blocks as Graph Nodes
workflow.add_node("triage_agent", agent_1_triage)
workflow.add_node("hospital_finder_agent", agent_2_hospital_finder)
workflow.add_node("ambulance_agent", agent_3_ambulance_coordinator)
workflow.add_node("doctor_brief_agent", agent_4_doctor_briefing)

# Define Linear Execution Order
workflow.add_edge(START, "triage_agent")
workflow.add_edge("triage_agent", "hospital_finder_agent")
workflow.add_edge("hospital_finder_agent", "ambulance_agent")
workflow.add_edge("ambulance_agent", "doctor_brief_agent")
workflow.add_edge("doctor_brief_agent", END)

# Compile Application Execution Block
medi_relay_app = workflow.compile()

# -------------------------------------------------------------
# Execution Block (Run Simulation)
# -------------------------------------------------------------
if __name__ == "__main__":
    # Ensure your GROQ API KEY environment variable is active
    # Set it via system shell terminal or directly input it safely below:
    # os.environ["GROQ_API_KEY"] = "gsk_..."

    if not os.environ.get("GROQ_API_KEY"):
        print("⚠️ Warning: Please make sure GROQ_API_KEY environment variable is set.")

    # Target test emergency state variables (Kolkata region matched coordinates)
    initial_emergency_input = {
        "raw_symptoms": "58-year-old female experiencing severe crushing chest pain radiating down her left arm with heavy sweating.",
        "patient_lat": 19.994028204162813,
        "patient_lng": 73.83387150723702
    }

    print("⚡ Triggering state traversal via MediRelay LangGraph Application...\n")
    final_output = medi_relay_app.invoke(initial_emergency_input)

    # Output execution results
    print("================== MEDIRELAY GRAPH OUTPUT ==================")
    print(f"🚨 Triage Severity: {final_output['severity_level']}")
    print(f"🩺 Suspected Issue: {final_output['suspected_condition']}")
    print(
        f"🏥 Selected Target: {final_output['selected_hospital']['name']} (Rating: {final_output['selected_hospital']['rating']})")
    print(f"⏱️ Ambulance ETA:   {final_output['eta_minutes']} Minutes")
    print("============================================================")
    print("\n📋 CLINICAL BRIEF DISPATCHED TO ER DOCTOR ROOM:")
    print(final_output['doctor_brief'])