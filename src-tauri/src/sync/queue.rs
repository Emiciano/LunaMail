use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueStatusSnapshot {
    pub pending: i64,
    pub failed: i64,
    pub in_flight: i64,
}

#[derive(Debug, Clone, Copy)]
pub struct QueueBackoffPolicy {
    pub max_attempts: i64,
}

impl Default for QueueBackoffPolicy {
    fn default() -> Self {
        Self { max_attempts: 8 }
    }
}

impl QueueBackoffPolicy {
    pub fn next_retry_minutes(&self, attempt: i64) -> i64 {
        let bounded = attempt.clamp(1, self.max_attempts.max(1));
        2_i64.pow((bounded - 1) as u32)
    }
}
