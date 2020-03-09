var uuidv4 = require("uuid/v4"),
  aws = require("aws-sdk"),
  express = require("express");

const counters = [];

function checkTrailingSlash(path) {
  if (path && path[path.length - 1] != "/") {
    path += "/";
  }
  return path;
}

function S3Router(options, middleware) {
  if (!middleware) {
    middleware = [];
  }

  var getFileKeyDir =
    options.getFileKeyDir ||
    function() {
      return "";
    };

  /*
  var S3_BUCKET = options.bucket,;
  if (!S3_BUCKET) {
    throw new Error("S3_BUCKET is required.");
  }
  */

  var getS3 = options.getS3;
  if (!getS3) {
    var s3Options = {};
    if (options.region) {
      s3Options.region = options.region;
    }
    if (options.signatureVersion) {
      s3Options.signatureVersion = options.signatureVersion;
    }

    getS3 = function() {
      return new aws.S3(s3Options);
    };
  }

  if (options.uniquePrefix === undefined) {
    options.uniquePrefix = true;
  }

  var router = express.Router();

  /**
   * Redirects image requests with a temporary signed URL, giving access
   * to GET an upload.
   */
  function tempRedirect(req, res) {
    const { purpose } = req.query;
    console.log("purpose in s3router is", purpose);

    let bucket = null;
    if (purpose !== "jobEngagementUpload") {
      return;
    } else {
      bucket = "storylo-jobengagement-uploads";
    }

    var params = {
      Bucket: bucket,
      Key: checkTrailingSlash(getFileKeyDir(req)) + req.params[0]
    };
    var s3 = getS3();
    s3.getSignedUrl("getObject", params, function(err, url) {
      res.redirect(url);
    });
  }

  /**
   * Image specific route.
   */
  router.get(/\/img\/(.*)/, middleware, function(req, res) {
    return tempRedirect(req, res);
  });

  /**
   * Other file type(s) route.
   */
  router.get(/\/uploads\/(.*)/, middleware, function(req, res) {
    return tempRedirect(req, res);
  });

  /**
   * Returns an object with `signedUrl` and `publicUrl` properties that
   * * give temporary access to PUT an object in an S3 bucket.
   */
  router.get("/sign", middleware, function(req, res) {
    let counter = counters[req.query.path];
    if (counter === undefined || counter === null) {
      counter = 0;
    }
    console.log("req.query is", req.query);

    const { purpose } = req.query;
    console.log("purpose in s3router is", purpose);

    let bucket = null;
    if (
      purpose !== "jobEngagementUpload" &&
      purpose !== "portfolioImages" &&
      purpose !== "clientLogos" &&
      purpose !== "modelImages" &&
      purpose !== "jobSamplePhotography" &&
      purpose !== "modelReleaseFormsUpload"
    ) {
      return;
    } else if (purpose === "jobEngagementUpload") {
      bucket = "storylo-jobengagement-uploads";
    } else if (purpose === "portfolioImages") {
      bucket = "storylo-portfolio-images";
    } else if (purpose === "clientLogos") {
      bucket = "storylo-client-logos";
    } else if (purpose === "modelImages") {
      bucket = "storylo-model-images";
    } else if (purpose === "jobSamplePhotography") {
      bucket = "storylo-job-posting-photos";
    } else if (purpose === "modelReleaseFormsUpload") {
      bucket = "storylo-model-release-forms";
    }

    if (!bucket) return;

    let lastIndex = 0;
    if (req.query.lastIndex) {
      lastIndex = parseInt(req.query.lastIndex, 10);
    }
    if (lastIndex < 0) lastIndex = 0;
    counter = counter + 1;
    counters[req.query.path] = counter;
    var filename = (req.query.path || "") + (counter + lastIndex) + ".jpg";

    if (purpose === "jobEngagementUpload") {
      filename = (req.query.path || "") + req.query.fileKey + ".jpg";
    }
    var mimeType = req.query.contentType;
    var fileKey = checkTrailingSlash(getFileKeyDir(req)) + filename;
    // Set any custom headers
    if (options.headers) {
      res.set(options.headers);
    }
    var s3 = getS3();
    var params = {
      Bucket: bucket,
      Key: fileKey,
      Expires: options.signatureExpires || 60,
      ContentType: mimeType,
      ACL: options.ACL || "private"
    };
    console.log("call getSignedUrl with params", params);
    s3.getSignedUrl("putObject", params, function(err, data) {
      if (err) {
        console.log(err);
        return res.send(500, "Cannot create S3 signed URL");
      }
      res.json({
        signedUrl: data,
        publicUrl: "/s3/uploads/" + filename,
        filename: filename,
        fileKey: fileKey,
        originalFilename: req.query.objectName,
        newFilename: counter + lastIndex + ".jpg"
      });
    });
  });

  router.get("/s3", middleware, function(req, res) {});

  router.get("*", function(req, res) {});

  router.post("*", function(req, res) {});
  return router;
}

module.exports = S3Router;
