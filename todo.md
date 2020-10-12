* Store image cache in .gemdrive, not the tree
* Handle too large of upload JSON.
* PUT debugging notes
  * Seems to work when authenticated
  * When not authenticated, returns 403 for small files, but hangs on big
    files. If you try a big file first, small files hang behind them.
  * I'm guessing the problem has something to do with cancellation.
* Add ability to have the server return the hash of a specific file, in order
  to implement things like syncing?
  * This might be better left to the application layer, ie when uploading
    large files, the uploader should generative the hashes and store them
    alongside the files.
  * I think hash algorithms like MD5 can be computed while streaming, so
    potentially during upload. Might be tricky if a file is modified though.
    But how often are large files modified?
* Return perms in remfs.json so frontend can indicate user doesn't have
  access, as well as avoiding requests that will fail.
* Parse token from Authorization header
* Implement caching
  * Do we want to apply different caching per domain, to completely prevent
    caching when running apps like delver?
* Implement domain/link map for routing different domain names
* Fix HTML dir listings with whitespace in names
* Properly handle permissions for /.remfs/images/. They should match the
  stripped path.
  * I think this is fixed?
* Implement upload handling that is robust enough I trust it with a genome.
  For example it needs to be able to resume. Probably do things in small
  chunks.
