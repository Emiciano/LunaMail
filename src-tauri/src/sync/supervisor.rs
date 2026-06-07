use super::account_worker::AccountRuntimeStatus;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SyncHealthSnapshot {
    pub queue_pending_total: i64,
    pub queue_failed_total: i64,
    pub queue_in_flight_total: i64,
    pub accounts: Vec<AccountRuntimeStatus>,
}

#[derive(Default)]
pub struct SyncSupervisor {
    statuses: Mutex<HashMap<i64, AccountRuntimeStatus>>,
}

impl SyncSupervisor {
    pub fn acquire_account(&self, _account_id: i64) {}

    pub fn update_runtime<F>(&self, account_id: i64, f: F)
    where
        F: FnOnce(&mut AccountRuntimeStatus),
    {
        if let Ok(mut map) = self.statuses.lock() {
            let status = map
                .entry(account_id)
                .or_insert_with(|| AccountRuntimeStatus {
                    account_id,
                    ..AccountRuntimeStatus::default()
                });
            f(status);
        }
    }

    pub fn snapshot(&self) -> SyncHealthSnapshot {
        let accounts = self
            .statuses
            .lock()
            .map(|map| map.values().cloned().collect::<Vec<_>>())
            .unwrap_or_default();
        let queue_pending_total = accounts.iter().map(|item| item.queue_pending).sum();
        let queue_failed_total = accounts.iter().map(|item| item.queue_failed).sum();
        let queue_in_flight_total = accounts.iter().map(|item| item.queue_in_flight).sum();
        SyncHealthSnapshot {
            queue_pending_total,
            queue_failed_total,
            queue_in_flight_total,
            accounts,
        }
    }
}
