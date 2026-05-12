use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressEvent {
    pub stage: String,
    pub percent: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_sec: Option<f64>,
}

pub struct Job {
    pub tx: broadcast::Sender<ProgressEvent>,
    pub cancel_tx: broadcast::Sender<()>,
}

pub type JobStore = Arc<RwLock<HashMap<String, Job>>>;

pub fn new_job_store() -> JobStore {
    Arc::new(RwLock::new(HashMap::new()))
}
