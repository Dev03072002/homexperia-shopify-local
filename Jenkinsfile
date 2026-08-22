// Homexperia Shopify app — production pipeline.
//
// Two independent outcomes:
//   * Backend  -> Docker container on EC2, behind Nginx at shopify.homexperia.com
//   * Shopify  -> theme app extension / app version, published to Shopify
//
// A normal backend deployment NEVER publishes a Shopify app version. Publishing
// replaces the active version for every merchant with the app installed, so it
// is gated behind the RELEASE_SHOPIFY parameter and is off by default.
//
// Server connectivity is intentionally not defined here. The Deploy stage runs
// deploy/deploy.sh, and the AWS team decides how that reaches EC2 — by running
// the job on an agent on the host, or by wrapping the call in their own
// transport. Nothing below hard-codes a host, IP, registry, or credential path.

pipeline {
  agent any

  parameters {
    booleanParam(
      name: 'DEPLOY_BACKEND',
      defaultValue: true,
      description: 'Build the image and roll out the backend container on EC2.'
    )
    booleanParam(
      name: 'RELEASE_SHOPIFY',
      defaultValue: false,
      description: 'Publish the theme app extension and app configuration to Shopify. Affects all merchants. Leave off for backend-only changes.'
    )
  }

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  environment {
    // Runtime env file, deliberately outside the Jenkins-managed checkout.
    APP_ENV_FILE = '/home/sopify/.config/homexperia-shopify/app.env'
    IMAGE_TAG    = "${env.GIT_COMMIT ?: env.BUILD_NUMBER}"
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Install') {
      steps {
        // npm ci uses the tracked package-lock.json for a reproducible tree.
        sh 'npm ci'
      }
    }

    stage('Validate') {
      steps {
        sh 'npx prisma generate'
        // A placeholder URL is enough for schema validation; nothing connects.
        sh 'DATABASE_URL="postgresql://validate:validate@127.0.0.1:5432/validate" npx prisma validate'
        sh 'npm run lint'
        sh 'npm run typecheck'
      }
    }

    stage('Build') {
      steps {
        // Builds the extension asset so a broken widget or a bad
        // HOMEXPERIA_TARGET_URL fails here rather than at release time.
        // Publishing is a separate, explicit stage.
        withCredentials([string(credentialsId: 'homexperia-target-url', variable: 'HOMEXPERIA_TARGET_URL')]) {
          sh 'npm run build:extension'
        }
        sh 'npm run build'

        // The readable widget source must never reach the extension bundle.
        sh '''
          if find extensions -name '*.js' -not -name '*.min.js' | grep .; then
            echo "Readable JavaScript found inside extensions/"
            exit 1
          fi
          test -f extensions/homexperia-storefront/assets/homexperia.min.js
        '''
      }
    }

    stage('Docker build') {
      when { expression { return params.DEPLOY_BACKEND } }
      steps {
        // Validates the image builds before anything on the host is touched.
        sh "docker build -t homexperia-shopify-app:${IMAGE_TAG} ."
      }
    }

    stage('Deploy backend') {
      when { expression { return params.DEPLOY_BACKEND } }
      steps {
        // deploy.sh runs migrations first and only replaces the container if
        // they succeed, then health-checks and rolls back on failure.
        sh """
          chmod +x deploy/deploy.sh
          APP_ENV_FILE='${APP_ENV_FILE}' ./deploy/deploy.sh '${IMAGE_TAG}'
        """
      }
    }

    stage('Release Shopify extension') {
      when { expression { return params.RELEASE_SHOPIFY } }
      steps {
        // PENDING: requires the production Shopify app, which does not exist
        // yet. Configure 'shopify-app-automation-token' in the Credentials
        // Store once the app is created in the Dev Dashboard.
        withCredentials([
          string(credentialsId: 'shopify-app-automation-token', variable: 'SHOPIFY_APP_AUTOMATION_TOKEN'),
          string(credentialsId: 'homexperia-target-url', variable: 'HOMEXPERIA_TARGET_URL')
        ]) {
          sh 'npm run build:extension'
          sh 'npm install -g @shopify/cli@latest'
          // --allow-updates is required because include_config_on_deploy is true,
          // so app configuration is published alongside the extension.
          sh """
            shopify app deploy --allow-updates \
              --source-control-url "${env.GIT_URL ?: ''}"
          """
        }
      }
    }
  }

  post {
    failure {
      echo 'Pipeline failed. If the Deploy backend stage failed, deploy.sh has already restored the previous container.'
    }
    always {
      // Never leave a checkout with build output on a shared agent.
      cleanWs()
    }
  }
}
