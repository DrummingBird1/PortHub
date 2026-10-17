//! Local ROM/ISO hashing and matching. Files never leave the machine.

use md5::Md5;
use serde::{Deserialize, Serialize};
use sha1::Sha1;
use sha2::{Digest, Sha256};
use std::io::{self, Read};

/// Digests of a file, lowercase hex.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FileHashes {
    pub size_bytes: u64,
    pub sha1: String,
    pub md5: String,
    pub sha256: String,
}

/// Hashes of one supported version, as in the manifest (`romRequirements[].hashes`).
#[derive(Debug, Clone, Default, Deserialize)]
pub struct ExpectedHashes {
    pub sha1: Option<String>,
    pub md5: Option<String>,
    pub sha256: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RomRequirement {
    pub label: String,
    pub hashes: ExpectedHashes,
}

const CHUNK: usize = 1024 * 1024;

/// Stream `reader` once, computing SHA-1, MD5 and SHA-256 together (constant memory).
///
/// # Errors
/// Returns any I/O error from the reader.
pub fn hash_reader<R: Read>(mut reader: R) -> io::Result<FileHashes> {
    let (mut s1, mut m5, mut s256) = (Sha1::new(), Md5::new(), Sha256::new());
    let mut buf = vec![0u8; CHUNK];
    let mut size: u64 = 0;
    loop {
        let n = match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => n,
            Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(e),
        };
        let chunk = &buf[..n];
        s1.update(chunk);
        m5.update(chunk);
        s256.update(chunk);
        size += n as u64;
    }
    Ok(FileHashes {
        size_bytes: size,
        sha1: hex::encode(s1.finalize()),
        md5: hex::encode(m5.finalize()),
        sha256: hex::encode(s256.finalize()),
    })
}

fn eq(expected: Option<&String>, actual: &str) -> Option<bool> {
    expected.map(|e| e.eq_ignore_ascii_case(actual))
}

/// A requirement matches when it lists at least one hash and *every* listed hash matches.
pub fn matches(req: &ExpectedHashes, got: &FileHashes) -> bool {
    let checks = [
        eq(req.sha1.as_ref(), &got.sha1),
        eq(req.md5.as_ref(), &got.md5),
        eq(req.sha256.as_ref(), &got.sha256),
    ];
    let listed: Vec<bool> = checks.into_iter().flatten().collect();
    !listed.is_empty() && listed.iter().all(|ok| *ok)
}

/// Label of the first supported version matching `got`.
pub fn find_match<'a>(reqs: &'a [RomRequirement], got: &FileHashes) -> Option<&'a str> {
    reqs.iter()
        .find(|r| matches(&r.hashes, got))
        .map(|r| r.label.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    // Synthetic data only. Never use real ROMs in tests.
    const ABC_SHA1: &str = "a9993e364706816aba3e25717850c26c9cd0d89d";
    const ABC_MD5: &str = "900150983cd24fb0d6963f7d28e17f72";
    const ABC_SHA256: &str = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

    fn req(label: &str, h: ExpectedHashes) -> RomRequirement {
        RomRequirement {
            label: label.into(),
            hashes: h,
        }
    }

    #[test]
    fn known_vectors() {
        let h = hash_reader(&b"abc"[..]).unwrap();
        assert_eq!(h.size_bytes, 3);
        assert_eq!(h.sha1, ABC_SHA1);
        assert_eq!(h.md5, ABC_MD5);
        assert_eq!(h.sha256, ABC_SHA256);
    }

    #[test]
    fn empty_input() {
        let h = hash_reader(io::empty()).unwrap();
        assert_eq!(h.size_bytes, 0);
        assert_eq!(h.sha1, "da39a3ee5e6b4b0d3255bfef95601890afd80709");
    }

    #[test]
    fn streaming_across_chunks_matches_one_shot() {
        let data: Vec<u8> = (0..(CHUNK * 3 + 17))
            .map(|i| u8::try_from(i % 251).unwrap())
            .collect();
        let mut f = tempfile::NamedTempFile::new().unwrap();
        f.write_all(&data).unwrap();
        let streamed = hash_reader(std::fs::File::open(f.path()).unwrap()).unwrap();
        assert_eq!(streamed.size_bytes, data.len() as u64);
        assert_eq!(streamed.sha256, hex::encode(Sha256::digest(&data)));
        assert_eq!(streamed.sha1, hex::encode(Sha1::digest(&data)));
    }

    #[test]
    fn matching_rules() {
        let got = hash_reader(&b"abc"[..]).unwrap();
        let reqs = vec![
            req(
                "wrong",
                ExpectedHashes {
                    sha1: Some("00".repeat(20)),
                    ..Default::default()
                },
            ),
            req("empty", ExpectedHashes::default()),
            req(
                "right",
                ExpectedHashes {
                    sha1: Some(ABC_SHA1.to_uppercase()),
                    md5: Some(ABC_MD5.into()),
                    sha256: None,
                },
            ),
        ];
        assert_eq!(find_match(&reqs, &got), Some("right"));
        // A requirement with a mismatching second hash must not match.
        let mixed = ExpectedHashes {
            sha1: Some(ABC_SHA1.into()),
            md5: Some("0".repeat(32)),
            sha256: None,
        };
        assert!(!matches(&mixed, &got));
        // No hashes listed never matches.
        assert!(!matches(&ExpectedHashes::default(), &got));
        assert_eq!(find_match(&reqs[..2], &got), None);
    }
}
