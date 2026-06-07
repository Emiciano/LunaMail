use serde::Serialize;

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AccountRuntimeStatus {
    pub account_id: i64,
    pub idle_active: bool,
    pub polling_active: bool,
    pub polling_interval_seconds: i64,
    pub queue_pending: i64,
    pub queue_failed: i64,
    pub queue_in_flight: i64,
    pub last_sync_at: Option<String>,
    pub last_sync_error: Option<String>,
    pub last_sync_duration_ms: Option<i64>,
    pub consecutive_failures: i64,
}
