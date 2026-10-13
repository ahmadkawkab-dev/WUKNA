namespace Wukna.Features.Library;

// Expected error contract; no endpoints or error mappings are registered in B1.
public sealed record LibraryErrorDto(string Code);

public static class LibraryErrors
{
    public const string Unavailable = "library_unavailable";
    public const string NotFound = "library_not_found";
    public const string InvalidQuery = "library_invalid_query";
    public const string InvalidCursor = "library_invalid_cursor";
    public const string InvalidItem = "library_invalid_item";
    public const string InvalidFolder = "library_invalid_folder";
    public const string FolderNotEmpty = "library_folder_not_empty";
    public const string FolderNameConflict = "library_folder_name_conflict";
    public const string ItemTrashed = "library_item_trashed";
    public const string VideoDuplicate = "library_video_duplicate";
    public const string UploadConflict = "library_upload_conflict";
    public const string UploadExpired = "library_upload_expired";
    public const string FileType = "library_file_type";
    public const string FileRejected = "library_file_rejected";
    public const string FileTooLarge = "library_file_too_large";
    public const string QuotaExceeded = "library_quota_exceeded";
    public const string ProcessingUnavailable = "library_processing_unavailable";
    public const string StorageUnavailable = "library_storage_unavailable";
    public const string RateLimited = "library_rate_limited";
}
