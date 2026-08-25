# Requirements Document

## Introduction

This feature introduces an internal back-office **Admin Console** for the HRT swag showcase site. Today the product catalog is hardcoded as JavaScript arrays in `src/components/Products.jsx`, so any catalog change requires a code edit and redeploy. Phase 1 of the platform evolution replaces this with a login-protected admin capability where authorized HRT staff can manage products (create, read, update, delete) without touching source code. The admin-managed catalog then feeds the existing public showcase page.

This spec is scoped as an **internal tool for a single organization (HRT)**. Multi-tenant, multi-store, and public self-service registration concerns are explicitly out of scope. Order and cart management are noted as a future (secondary) area and are not covered here beyond preserving the existing public cart behavior.

**Key decision deferred to design:** The current project has no backend or database. Requirements below describe catalog persistence and multi-user visibility in solution-free terms (WHAT must be true), so the design phase can choose the persistence mechanism (for example browser-local storage, a Backend-as-a-Service such as Supabase or Firebase, or a dedicated backend). The completeness requirements in this document (persist across sessions, visible to all public visitors) are intended to inform that choice.

### In Scope
- Admin authentication and session management
- Product CRUD (create, read, update, delete)
- Product data fields matching the existing catalog schema, with validation
- Product image handling
- Catalog persistence and its propagation to the public showcase
- Route/access separation between the public showcase and the protected admin console

### Out of Scope
- Order and cart management (future phase)
- Multi-tenant / multi-store capabilities
- Public user accounts or self-service registration
- Payment processing

## Glossary

- **Admin_Console**: The login-protected back-office interface used by authorized staff to manage the product catalog.
- **Public_Showcase**: The existing public-facing single-page site that displays products and provides the client-side cart.
- **Auth_Service**: The component responsible for authenticating staff credentials and managing admin sessions.
- **Catalog_Store**: The persistence component that stores product records and serves them to both the Admin_Console and the Public_Showcase.
- **Image_Handler**: The component responsible for accepting, storing, and returning references to product images.
- **Administrator**: An authenticated HRT staff member authorized to use the Admin_Console.
- **Product**: A catalog record with the fields defined in Requirement 4 (name, brand, image, description, features, colors, sizes, quantity/price tiers, price includes, additional charges).
- **Category**: A grouping under which a Product is displayed on the Public_Showcase (for example Tote Bags, Water Bottles, Umbrellas).
- **Price_Tier**: A paired quantity threshold and unit price for a Product (the existing `quantity[]` and `price[]` parallel arrays).
- **Admin_Session**: An authenticated period of access granted after a successful login.

## Requirements

### Requirement 1: Administrator Authentication

**User Story:** As an HRT staff member, I want the admin console to require login, so that only authorized people can change the catalog.

#### Acceptance Criteria

1. WHEN an unauthenticated visitor requests any Admin_Console route, THE Auth_Service SHALL redirect the visitor to the login screen without granting access to any Admin_Console function.
2. WHEN an Administrator submits valid credentials, THE Auth_Service SHALL establish an Admin_Session and grant access to the Admin_Console.
3. IF an Administrator submits invalid credentials, THEN THE Auth_Service SHALL deny access, retain the Administrator on the login screen with no Admin_Session established, and display an error message indicating that authentication failed without indicating which credential was incorrect.
4. WHEN an Administrator submits credentials, THE Auth_Service SHALL return an authentication result within 3 seconds of submission.
5. THE Auth_Service SHALL transmit submitted credentials over an encrypted connection.
6. IF an Administrator submits the login form with an empty username field or an empty password field, THEN THE Auth_Service SHALL reject the submission without attempting authentication and display a validation message identifying each empty required field.
7. IF an Administrator submits invalid credentials 5 consecutive times for the same account, THEN THE Auth_Service SHALL deny further authentication attempts for that account for 15 minutes and display a message indicating the account is temporarily locked.

### Requirement 2: Admin Session Management

**User Story:** As an HRT staff member, I want my admin session to be controlled and revocable, so that access does not remain open on shared or idle devices.

#### Acceptance Criteria

1. WHEN an Administrator selects logout, THE Auth_Service SHALL terminate the Admin_Session and redirect the Administrator to the login screen within 3 seconds.
2. WHILE an Admin_Session is active, THE Admin_Console SHALL grant the Administrator access to the product management functions defined in Requirements 3, 4, and 5.
3. WHILE an Admin_Session is active, WHEN the Administrator issues any Administrator-initiated request, THE Auth_Service SHALL reset the idle interval for that Admin_Session.
4. WHEN an Admin_Session has had no Administrator-initiated request for 30 continuous minutes, THE Auth_Service SHALL terminate the Admin_Session, redirect the Administrator to the login screen, and display a message indicating the session expired due to inactivity.
5. IF a request to a protected function is made after the Admin_Session has terminated, THEN THE Auth_Service SHALL deny the request, return no protected data, and redirect to the login screen.

### Requirement 3: View Product Catalog in Admin Console

**User Story:** As an Administrator, I want to see all products in the admin console, so that I can review and select items to manage.

#### Acceptance Criteria

1. WHILE an Admin_Session is active, WHEN an Administrator opens the product list view, THE Admin_Console SHALL retrieve all Products from the Catalog_Store and display them ordered alphabetically by Product name within 3 seconds under normal operating conditions.
2. THE Admin_Console SHALL display each Product's name, brand, Category, and primary image in the product list, where the primary image is the first image reference stored for the Product.
3. WHEN the Catalog_Store contains no Products, THE Admin_Console SHALL display an empty-state message indicating no products exist.
4. WHEN an Administrator selects a Product from the list, THE Admin_Console SHALL display the full set of fields for that Product as defined in Requirement 4.
5. WHERE a Product has no stored image reference, THE Admin_Console SHALL display a placeholder indicator in place of the Product's primary image in the product list.
6. IF the Catalog_Store cannot be reached while loading the product list, THEN THE Admin_Console SHALL display an error message indicating the product catalog is temporarily unavailable and SHALL preserve the active Admin_Session.

### Requirement 4: Create and Edit Product Data

**User Story:** As an Administrator, I want to create and edit products with all catalog fields, so that the catalog reflects current swag offerings without code changes.

#### Acceptance Criteria

1. WHEN an Administrator submits a new Product with all required fields, THE Catalog_Store SHALL persist the Product and assign a unique Product identifier.
2. WHILE an Administrator is editing a Product, THE Admin_Console SHALL update the working copy of the Product in memory as field values change, without persisting to the Catalog_Store.
3. WHEN an Administrator saves edits to an existing Product, THE Catalog_Store SHALL persist the updated field values against the same Product identifier.
4. THE Admin_Console SHALL accept the following Product fields: name (1 to 100 characters), brand (1 to 100 characters), Category (1 to 60 characters), description (0 to 2,000 characters), image, features list (0 to 50 entries, each 1 to 200 characters), colors list (0 to 50 entries), sizes description (0 to 500 characters), one to 20 Price_Tiers, price-includes text (0 to 500 characters), and additional-charges list (0 to 50 entries, each 1 to 200 characters).
5. IF an Administrator submits a Product without a name, brand, Category, or at least one Price_Tier, THEN THE Admin_Console SHALL reject the submission and display a validation message identifying each missing required field.
6. IF an Administrator enters a Price_Tier whose quantity is not an integer from 1 to 1,000,000 or whose price is not a number from 0.00 to 999,999.99, THEN THE Admin_Console SHALL reject the submission and display a validation message identifying the invalid Price_Tier.
7. WHERE an Administrator adds a color entry, THE Admin_Console SHALL accept a color label and an associated color value for that entry.
8. WHERE an Administrator provides optional fields (features, colors, additional charges, price-includes text), THE Catalog_Store SHALL persist the provided values with the Product.
9. IF an Administrator submits a Product with a field value that exceeds the maximum length or entry count defined for that field, THEN THE Admin_Console SHALL reject the submission and display a validation message identifying each field that exceeds its limit.
10. IF the Catalog_Store fails to persist a new or updated Product, THEN THE Admin_Console SHALL display an error message indicating the save did not complete and SHALL retain the Administrator's entered field values.

### Requirement 5: Delete Product

**User Story:** As an Administrator, I want to delete products, so that discontinued swag is removed from the catalog.

#### Acceptance Criteria

1. WHEN an Administrator confirms deletion of a Product, THE Catalog_Store SHALL remove the Product from the catalog within 3 seconds under normal operating conditions.
2. WHEN an Administrator requests deletion of a Product, THE Admin_Console SHALL prompt for explicit confirmation and SHALL NOT begin removal until explicit confirmation is received.
3. WHEN a Product has been deleted, THE Public_Showcase SHALL exclude the deleted Product from the displayed catalog on its next load.
4. IF an Administrator attempts to delete a Product that no longer exists in the Catalog_Store, THEN THE Admin_Console SHALL display a message indicating the Product was not found.
5. WHEN an Administrator cancels or dismisses the deletion confirmation prompt, THE Admin_Console SHALL retain the Product unchanged and return to the view shown before the deletion request.
6. WHEN a Product has been successfully removed, THE Admin_Console SHALL display a confirmation indicating the Product was deleted.
7. IF the Catalog_Store fails to remove a Product after deletion is confirmed, THEN THE Admin_Console SHALL display an error message indicating the deletion did not complete and SHALL retain the Product unchanged.

### Requirement 6: Product Image Handling

**User Story:** As an Administrator, I want to attach an image to each product, so that products display correctly on the showcase.

#### Acceptance Criteria

1. WHEN an Administrator uploads an image file for a Product and the Image_Handler successfully stores it, THE Image_Handler SHALL return a stored-image reference usable by the Public_Showcase and the Admin_Console.
2. THE Image_Handler SHALL accept image files in JPEG, PNG, and WebP formats.
3. IF an Administrator uploads a file that is not one of the supported image formats (JPEG, PNG, or WebP), THEN THE Image_Handler SHALL reject the file, leave any existing image reference for the Product unchanged, and display a message listing the supported formats.
4. IF an Administrator uploads an image file larger than 5 megabytes, THEN THE Image_Handler SHALL reject the file, leave any existing image reference for the Product unchanged, and display a message stating the 5-megabyte size limit.
5. WHEN an Administrator saves a Product without a newly uploaded image during an edit, THE Catalog_Store SHALL retain the Product's existing image reference.
6. IF the Image_Handler cannot store an uploaded image that passed format and size validation, THEN THE Image_Handler SHALL reject the upload, leave any existing image reference for the Product unchanged, and display a message indicating the image could not be saved.

### Requirement 7: Catalog Persistence and Public Propagation

**User Story:** As an HRT staff member, I want catalog changes to persist and appear on the public site, so that the showcase reflects what staff have configured.

#### Acceptance Criteria

1. WHEN an Administrator creates, edits, or deletes a Product, THE Catalog_Store SHALL persist the change so that the change remains retrievable after the browser session ends and after the Admin_Console is closed and reopened.
2. WHEN a visitor loads the Public_Showcase, THE Public_Showcase SHALL retrieve and display the current set of Products from the Catalog_Store within 3 seconds under normal operating conditions.
3. WHEN a visitor loads the Public_Showcase after an Administrator has persisted a create, edit, or delete, THE Public_Showcase SHALL reflect that change in the displayed catalog.
4. WHEN the Public_Showcase displays Products, THE Public_Showcase SHALL group the displayed Products by Category, with each Product shown under exactly one Category.
5. WHEN the Catalog_Store returns Products for the Public_Showcase, THE Public_Showcase SHALL render each Product using the existing product-card fields (name, brand, image, description, features, colors, sizes, Price_Tiers, price includes, additional charges).
6. WHEN the Catalog_Store contains no Products, THE Public_Showcase SHALL display an empty-state message indicating no products are currently available.
7. IF the Catalog_Store cannot be reached within 3 seconds when loading the Public_Showcase, THEN THE Public_Showcase SHALL display a message indicating products are temporarily unavailable and SHALL NOT display an empty or partial catalog as if no Products exist.

### Requirement 8: Preserve Existing Public Cart Behavior

**User Story:** As a public visitor, I want the cart to keep working with admin-managed products, so that browsing and selecting swag is unaffected by the new admin capability.

#### Acceptance Criteria

1. WHEN a visitor adds a Catalog_Store Product to the cart and no cart item with a matching Product unique identifier already exists, THE Public_Showcase SHALL create a new cart item keyed on the Product's unique identifier, using the specified quantity, or a default quantity of 1 when no quantity is specified.
2. WHEN a visitor adds a Product whose unique identifier already matches an existing cart item, THE Public_Showcase SHALL increase that existing cart item's quantity by the added quantity and SHALL NOT create a duplicate cart item.
3. WHEN a visitor adds a Product to the cart, THE Public_Showcase SHALL compute the cart item's line total as the Product's first Price_Tier unit price multiplied by that cart item's quantity.
4. THE Public_Showcase SHALL provide, for admin-managed Products, client-side cart functions to add a Product, remove a cart item identified by its Product unique identifier, update a cart item's quantity, and clear all cart items.
5. THE Public_Showcase SHALL expose a running cart item count equal to the sum of all cart item quantities and a running cart total equal to the sum of all cart item line totals.
6. IF a visitor updates a cart item's quantity to zero or a negative value, THEN THE Public_Showcase SHALL remove that cart item from the cart.

### Requirement 9: Access Separation Between Public and Admin

**User Story:** As an HRT staff member, I want the admin console kept separate from the public site, so that visitors never see management controls.

#### Acceptance Criteria

1. THE Public_Showcase SHALL be reachable without an active Admin_Session and without presenting a login prompt or credential challenge.
2. THE Admin_Console SHALL be reachable only through a dedicated URL path that is not shared with any Public_Showcase URL path.
3. WHILE no Admin_Session is active, THE Public_Showcase SHALL display no product create, edit, or delete controls.
4. WHILE an Admin_Session is active, THE Public_Showcase SHALL display an edit control adjacent to each displayed Product for the Administrator.
5. WHILE an Admin_Session is active, THE Public_Showcase SHALL display a delete control adjacent to each displayed Product for the Administrator.
6. WHILE no Admin_Session is active, THE Public_Showcase SHALL present no navigation link, button, or other visible entry point to the Admin_Console.
