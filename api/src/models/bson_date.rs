use chrono::{DateTime, Utc};
use mongodb::bson::DateTime as BsonDateTime;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

#[derive(Deserialize)]
#[serde(untagged)]
enum DateInput {
    Bson(BsonDateTime),
    Chrono(DateTime<Utc>),
}

fn bson_to_chrono(b: BsonDateTime) -> DateTime<Utc> {
    DateTime::from_timestamp_millis(b.timestamp_millis()).unwrap_or_else(Utc::now)
}

pub mod flexible_datetime {
    use super::*;

    pub fn serialize<S>(dt: &DateTime<Utc>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let bson_dt = BsonDateTime::from_millis(dt.timestamp_millis());
        bson_dt.serialize(serializer)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<DateTime<Utc>, D::Error>
    where
        D: Deserializer<'de>,
    {
        match DateInput::deserialize(deserializer)? {
            DateInput::Bson(b) => Ok(bson_to_chrono(b)),
            DateInput::Chrono(c) => Ok(c),
        }
    }
}

pub mod flexible_datetime_option {
    use super::*;

    pub fn serialize<S>(opt: &Option<DateTime<Utc>>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match opt {
            Some(dt) => {
                let bson_dt = BsonDateTime::from_millis(dt.timestamp_millis());
                serializer.serialize_some(&bson_dt)
            }
            None => serializer.serialize_none(),
        }
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<DateTime<Utc>>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let opt = Option::<DateInput>::deserialize(deserializer)?;
        Ok(opt.map(|input| match input {
            DateInput::Bson(b) => bson_to_chrono(b),
            DateInput::Chrono(c) => c,
        }))
    }
}
