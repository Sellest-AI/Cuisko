# How to update Backblaze CORS

When trying to run the application you might face a CORS error when trying to upload a file with a presigned url.

You can check the current cors with this command
```ts
StorageCloudDeprecated.getBucketCors();
```
```
Current CORS configuration: [
  {
    "AllowedHeaders": [
      "authorization",
      "range"
    ],
    "AllowedMethods": [
      "HEAD",
      "GET"
    ],
    "AllowedOrigins": [
      "*"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

# Update CORS

In the upper result you can see that we are missing the ``PUT`` method in the ``AllowedMethods``. It is required to upload a file with a presigned url.

## Backblaze CLI

You can download the backblaze self contained command line at this [url](https://www.backblaze.com/docs/cloud-storage-command-line-tools).

### Run the CLI

Open a new terminal, make sure it's a command line terminal and NOT a powershell shell.

```b2-windows.exe```

### Log In

You will be shown a set of commands. We want to log in first.

```b2-windows.exe account authorize```

Follow the asked credentials. You need a ``Master Application Key``. So go to your Backblaze Application Key panel and create a new ``Master Application Key``.

### Update Bucket CORS

Create a ``CORS.json`` file with the following configuration. You can of course edit the configuration with your custom ``origin`` for example.

```
[
  {
    "corsRuleName": "downloadFromAnyOriginWithUpload",
    "allowedOrigins": [
      "*"
    ],
  "allowedHeaders": [
      "authorization",
      "content-type",
      "x-bz-file-name",
      "x-bz-content-sha1"
    ],
    "allowedOperations": [
      "b2_download_file_by_id",
      "b2_download_file_by_name",
      "b2_upload_file",
      "b2_upload_part",
      "s3_get",
      "s3_put"
    ],
    "maxAgeSeconds": 3600
  }
]
```

Ask chatGPT to format it in the following format. Visibility is either ``allPublic`` or ``allPrivate`` 

```
b2-windows.exe bucket update --cors-rules <JSON> <BUCK_NAME> <VISIBILIY>
```

```
b2-windows.exe bucket update --cors-rules "[{\"corsRuleName\":\"downloadFromAnyOriginWithUpload\",\"allowedOrigins\":[\"*\"],\"allowedHeaders\":[\"authorization\",\"content-type\",\"x-bz-file-name\",\"x-bz-content-sha1\"],\"allowedOperations\":[\"b2_download_file_by_id\",\"b2_download_file_by_name\",\"b2_upload_file\",\"b2_upload_part\",\"s3_get\",\"s3_put\"],\"maxAgeSeconds\":3600}]" Sellest-Development-01 allPublic
```

```b2-windows.exe bucket update --cors-rules```

You should be returned a JSON of the bucket. You're done 🎊.

> EDIT: Now ``StorageCloudDeprecated.getBucketCors();`` should return ``undefined``

