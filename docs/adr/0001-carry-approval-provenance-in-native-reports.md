# Carry approval provenance in native reports

AIFileDetector policy schema 2 records a reason and stable authority identifier on every exact rule or path exemption, and report schema 2 emits those effective exemptions as native evidence. Schema 1 remains accepted but its exemptions are explicitly unattributed. Keeping policy interpretation in AIFileDetector avoids a second parser in orchestrators, while exact scopes and non-cryptographic authority labels preserve reviewability without introducing wildcard escapes or key management.
